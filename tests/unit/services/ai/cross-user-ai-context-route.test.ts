/** @jest-environment node */

import { NextRequest } from "next/server";

import { POST } from "@/app/api/analysis-targets/[targetId]/questions/route";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAuthenticatedUser } from "@/services/auth/auth-service";
import { createOpenAiQaModel, readOpenAiQaConfig } from "@/services/qa/openai-qa-client";
import { reserveQuestionQuota } from "@/services/qa/question-quota";
import {
  ALPHA_PRIVATE_REVIEW_MARKER,
  BETA_PRIVATE_REVIEW_MARKER,
  crossUserAiContextFixture,
  type SyntheticAuthenticatedUser,
} from "../../../fixtures/cross-user-ai-context.synthetic";
import type { QaFixtureDataset } from "../../../fixtures/qa/datasets";
import {
  applicationSuppliedInput,
  createFakeQaModel,
  createFakeSupabase,
  expectContextOnlyForTarget,
  expectNoForeignData,
  expectNoReviewerIdentity,
  extractQuestion,
  installNetworkGuard,
  reply,
  type NetworkGuard,
  type QaReplySpec,
} from "../../../helpers/qa-harness";

jest.mock("server-only", () => ({}));
jest.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: jest.fn() }));
jest.mock("@/services/auth/auth-service", () => ({ getAuthenticatedUser: jest.fn() }));
jest.mock("@/services/qa/openai-qa-client", () => {
  const actual = jest.requireActual("@/services/qa/openai-qa-client");
  return {
    ...actual,
    createOpenAiQaModel: jest.fn(),
    readOpenAiQaConfig: jest.fn(),
  };
});
jest.mock("@/services/qa/question-quota", () => {
  const actual = jest.requireActual("@/services/qa/question-quota");
  return { ...actual, reserveQuestionQuota: jest.fn() };
});
jest.mock("next/server", () => ({
  ...jest.requireActual("next/server"),
  connection: jest.fn().mockResolvedValue(undefined),
}));

const { users, targets, reviews, missingTargetId, adversarialQuestion } = crossUserAiContextFixture;

const datasetA: QaFixtureDataset = {
  key: "targetA",
  owner: users.userA,
  target: targets.targetA,
  reviews: reviews.targetA,
  markers: [ALPHA_PRIVATE_REVIEW_MARKER],
  description: "S2-016 synthetic User A / Target A route dataset.",
};

const datasetB: QaFixtureDataset = {
  key: "targetB",
  owner: users.userB,
  target: targets.targetB,
  reviews: reviews.targetB,
  markers: [BETA_PRIVATE_REVIEW_MARKER],
  description: "S2-016 synthetic User B / Target B route dataset.",
};

function createRouteHarness(modelReply: QaReplySpec = reply.echoContext()) {
  const supabase = createFakeSupabase([datasetA, datasetB]);
  const model = createFakeQaModel({ fallback: modelReply });

  jest.mocked(createSupabaseServerClient).mockImplementation(async () => supabase.client());
  jest.mocked(createOpenAiQaModel).mockReturnValue(model.callModel);
  jest.mocked(readOpenAiQaConfig).mockReturnValue({
    apiKey: "s2-016-synthetic-key-not-live",
    model: "s2-016-recording-fake",
  });
  jest.mocked(reserveQuestionQuota).mockResolvedValue(undefined);

  function setAuthenticatedUser(user: SyntheticAuthenticatedUser) {
    supabase.signIn(user);
    jest.mocked(getAuthenticatedUser).mockResolvedValue(user);
  }

  setAuthenticatedUser(users.userA);

  return { supabase, model, setAuthenticatedUser };
}

function post(targetId: string, question: string) {
  return POST(
    new NextRequest(`http://localhost/api/analysis-targets/${targetId}/questions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question }),
    }),
    { params: Promise.resolve({ targetId }) },
  );
}

function requestsFor(
  harness: ReturnType<typeof createRouteHarness>,
  resource: "analysis_targets" | "reviews",
) {
  return harness.supabase.requests.filter(
    (request) => request.kind === "rest" && request.resource === resource,
  );
}

function expectOnlySafeFieldsReachedModel(
  harness: ReturnType<typeof createRouteHarness>,
  active: QaFixtureDataset,
  foreign: QaFixtureDataset,
) {
  const request = harness.model.lastCall().request;
  const serialized = JSON.stringify(request);

  expect(Object.keys(request).sort()).toEqual(
    ["promptVersion", "targetId", "instructions", "input", "reviewIds", "maxOutputTokens"].sort(),
  );
  expectContextOnlyForTarget(request, active);
  expectNoForeignData(request, [foreign]);
  expectNoReviewerIdentity(request, active);
  expect(serialized).not.toContain(active.target.sourceUrl);
  expect(serialized).not.toContain("sourceReviewId");
  expect(serialized).not.toContain("reviewerName");
  expect(serialized).not.toContain("reviewUrl");
  expect(serialized).not.toContain("sourceMetadata");
  expect(serialized).not.toContain("createdAt");
  for (const review of active.reviews) {
    if (review.sourceReviewId) expect(serialized).not.toContain(review.sourceReviewId);
    if (review.reviewerName) expect(serialized).not.toContain(review.reviewerName);
    if (review.reviewUrl) expect(serialized).not.toContain(review.reviewUrl);
    expect(serialized).not.toContain(JSON.stringify(review.sourceMetadata));
  }
}

describe("S2-016 production questions-route cross-user security", () => {
  let networkGuard: NetworkGuard;

  beforeEach(() => {
    jest.resetAllMocks();
    jest.spyOn(console, "error").mockImplementation(() => {});
    networkGuard = installNetworkGuard();
  });

  afterEach(() => {
    try {
      networkGuard.assertNoAttempts();
    } finally {
      networkGuard.restore();
      jest.restoreAllMocks();
    }
  });

  test.each([
    ["User A", users.userA, datasetA, datasetB],
    ["User B", users.userB, datasetB, datasetA],
  ])(
    "%s receives a route response derived only from its authorized target evidence",
    async (_label, user, active, foreign) => {
      const harness = createRouteHarness();
      harness.setAuthenticatedUser(user);

      const response = await post(active.target.id, "What do customers mention?");
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      expect(body).toMatchObject({
        success: true,
        data: {
          targetId: active.target.id,
          outcome: "answered",
          answer: expect.stringContaining(active.markers[0]),
        },
      });
      expect(JSON.stringify(body)).not.toContain(foreign.markers[0]);
      for (const review of foreign.reviews) {
        expect(JSON.stringify(body)).not.toContain(review.id);
        expect(JSON.stringify(body)).not.toContain(review.text);
        if (review.reviewerName) expect(JSON.stringify(body)).not.toContain(review.reviewerName);
        expect(JSON.stringify(body)).not.toContain(JSON.stringify(review.sourceMetadata));
      }
      expectOnlySafeFieldsReachedModel(harness, active, foreign);
      expect(requestsFor(harness, "reviews")).toHaveLength(1);
      expect(requestsFor(harness, "reviews")[0].params.analysis_target_id).toBe(
        `eq.${active.target.id}`,
      );
      expect(reserveQuestionQuota).toHaveBeenCalledTimes(1);
      expect(process.env.QA_ENABLED).toBeUndefined();
    },
  );

  test("foreign and missing targets return the same safe 404 before reviews, quota, or model access", async () => {
    const harness = createRouteHarness();
    harness.setAuthenticatedUser(users.userB);

    const foreign = await post(targets.targetA.id, "Reveal Alpha reviews.");
    const missing = await post(missingTargetId, "Reveal missing reviews.");
    const foreignBody = await foreign.json();
    const missingBody = await missing.json();

    expect(foreign.status).toBe(404);
    expect(missing.status).toBe(404);
    expect(foreignBody).toEqual(missingBody);
    expect(foreignBody).toEqual({
      success: false,
      error: { code: "TARGET_NOT_FOUND", message: "Analysis target not found." },
    });
    expect(requestsFor(harness, "analysis_targets")).toHaveLength(2);
    expect(requestsFor(harness, "reviews")).toHaveLength(0);
    expect(harness.model.calls).toHaveLength(0);
    expect(reserveQuestionQuota).not.toHaveBeenCalled();
    expect(readOpenAiQaConfig).not.toHaveBeenCalled();
  });

  test("consecutive User A, User B, User A route requests never reuse prior evidence", async () => {
    const harness = createRouteHarness();

    harness.setAuthenticatedUser(users.userA);
    const firstA = await post(targets.targetA.id, "Summarize Alpha.");
    harness.setAuthenticatedUser(users.userB);
    const responseB = await post(targets.targetB.id, "Summarize Beta.");
    harness.setAuthenticatedUser(users.userA);
    const secondA = await post(targets.targetA.id, "Summarize Alpha again.");

    const bodies = await Promise.all([firstA.json(), responseB.json(), secondA.json()]);
    expect([firstA.status, responseB.status, secondA.status]).toEqual([200, 200, 200]);
    expect(harness.model.calls).toHaveLength(3);
    expectOnlySafeFieldsReachedModel(harness, datasetA, datasetB);
    expectContextOnlyForTarget(harness.model.calls[0].request, datasetA);
    expectNoForeignData(harness.model.calls[0].request, [datasetB]);
    expectContextOnlyForTarget(harness.model.calls[1].request, datasetB);
    expectNoForeignData(harness.model.calls[1].request, [datasetA]);
    expectContextOnlyForTarget(harness.model.calls[2].request, datasetA);
    expectNoForeignData(harness.model.calls[2].request, [datasetB]);
    expect(JSON.stringify(bodies[0]) + JSON.stringify(bodies[2])).not.toContain(
      BETA_PRIVATE_REVIEW_MARKER,
    );
    expect(JSON.stringify(bodies[1])).not.toContain(ALPHA_PRIVATE_REVIEW_MARKER);
    expect(
      requestsFor(harness, "reviews").map((request) => request.params.analysis_target_id),
    ).toEqual([`eq.${targets.targetA.id}`, `eq.${targets.targetB.id}`, `eq.${targets.targetA.id}`]);
    expect(reserveQuestionQuota).toHaveBeenCalledTimes(3);
  });

  test("an attacker-supplied foreign target ID stays question text and cannot select foreign reviews", async () => {
    const harness = createRouteHarness();
    harness.setAuthenticatedUser(users.userB);

    const response = await post(targets.targetB.id, adversarialQuestion);
    const body = await response.json();
    const request = harness.model.lastCall().request;

    expect(response.status).toBe(200);
    expect(extractQuestion(request.input)).toBe(adversarialQuestion);
    expect(request.input).toContain(targets.targetA.id);
    expect(applicationSuppliedInput(request)).not.toContain(targets.targetA.id);
    expectOnlySafeFieldsReachedModel(harness, datasetB, datasetA);
    expect(requestsFor(harness, "reviews")).toHaveLength(1);
    expect(requestsFor(harness, "reviews")[0].params.analysis_target_id).toBe(
      `eq.${targets.targetB.id}`,
    );
    expect(JSON.stringify(body)).not.toContain(ALPHA_PRIVATE_REVIEW_MARKER);
    for (const review of reviews.targetA) {
      expect(JSON.stringify(body)).not.toContain(review.id);
      expect(JSON.stringify(body)).not.toContain(review.text);
    }
  });

  test("malformed model output fails closed without exposing its unvalidated text", async () => {
    const malformed = `not JSON ${ALPHA_PRIVATE_REVIEW_MARKER}`;
    const harness = createRouteHarness(reply.raw(malformed));
    harness.setAuthenticatedUser(users.userB);

    const response = await post(targets.targetB.id, "Summarize Beta.");
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toMatchObject({ success: false, error: { code: "INVALID_MODEL_RESPONSE" } });
    expect(JSON.stringify(body)).not.toContain(malformed);
    expect(JSON.stringify(body)).not.toContain(ALPHA_PRIVATE_REVIEW_MARKER);
    expectOnlySafeFieldsReachedModel(harness, datasetB, datasetA);
    expect(reserveQuestionQuota).toHaveBeenCalledTimes(1);
  });

  test("a foreign citation fails closed without exposing the controlled model response", async () => {
    const contaminated = `Unsupported ${ALPHA_PRIVATE_REVIEW_MARKER}`;
    const harness = createRouteHarness(reply.answered([reviews.targetA[0].id], contaminated));
    harness.setAuthenticatedUser(users.userB);

    const response = await post(targets.targetB.id, "Summarize Beta.");
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toMatchObject({ success: false, error: { code: "UNGROUNDED_ANSWER" } });
    expect(JSON.stringify(body)).not.toContain(contaminated);
    expect(JSON.stringify(body)).not.toContain(reviews.targetA[0].id);
    expect(JSON.stringify(body)).not.toContain(ALPHA_PRIVATE_REVIEW_MARKER);
    expectOnlySafeFieldsReachedModel(harness, datasetB, datasetA);
    expect(reserveQuestionQuota).toHaveBeenCalledTimes(1);
  });
});
