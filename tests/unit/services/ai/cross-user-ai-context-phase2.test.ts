/** @jest-environment node */

import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAuthenticatedUser } from "@/services/auth/auth-service";
import { TargetNotFoundError } from "@/services/analysis-targets/target-ownership";
import { answerQuestion } from "@/services/qa/answer-question";
import { buildReviewDatasetContext } from "@/services/qa/review-context";
import { runGroundedQaRequest } from "@/services/qa/qa-request";
import { SYSTEM_PROMPT_VERSION } from "@/services/qa/system-prompt";
import type { Review } from "@/services/reviews/review-service";
import {
  ALPHA_PRIVATE_REVIEW_MARKER,
  BETA_PRIVATE_REVIEW_MARKER,
  crossUserAiContextFixture,
  type SyntheticAuthenticatedUser,
} from "../../../fixtures/cross-user-ai-context.synthetic";
import type { QaFixtureDataset } from "../../../fixtures/qa/datasets";
import {
  QaHarnessAssertionError,
  applicationSuppliedInput,
  createFakeQaModel,
  expectAnswerHasNoForeignData,
  expectContextOnlyForTarget,
  expectGroundedAnswer,
  expectNoForeignData,
  expectNoReviewerIdentity,
  expectSystemPromptApplied,
  extractQuestion,
  installNetworkGuard,
  reply,
  type FakeQaModel,
  type NetworkGuard,
  type QaReplySpec,
} from "../../../helpers/qa-harness";

jest.mock("server-only", () => ({}));
jest.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: jest.fn() }));
jest.mock("@/services/auth/auth-service", () => ({ getAuthenticatedUser: jest.fn() }));

const { users, targets, reviews, missingTargetId, adversarialQuestion } = crossUserAiContextFixture;

const datasetA: QaFixtureDataset = {
  key: "targetA",
  owner: users.userA,
  target: targets.targetA,
  reviews: reviews.targetA,
  markers: [ALPHA_PRIVATE_REVIEW_MARKER],
  description: "S2-016 synthetic User A / Target A dataset.",
};

const datasetB: QaFixtureDataset = {
  key: "targetB",
  owner: users.userB,
  target: targets.targetB,
  reviews: reviews.targetB,
  markers: [BETA_PRIVATE_REVIEW_MARKER],
  description: "S2-016 synthetic User B / Target B dataset.",
};

interface Phase2PipelineOptions {
  readonly reviewRows?: Partial<{
    readonly targetA: readonly Review[];
    readonly targetB: readonly Review[];
  }>;
  /** Mutation hook: simulate persistence returning rows outside the requested target. */
  readonly ignoreReviewTargetFilter?: boolean;
  /** Deterministic provider reply used by the recording fake model. */
  readonly modelReply?: QaReplySpec;
}

function createSessionScopedSupabaseFixture(options: Phase2PipelineOptions = {}) {
  const targetRows: Record<string, unknown>[] = [targets.targetA, targets.targetB].map(
    (target) => ({
      id: target.id,
      owner_id: target.ownerId,
      name: target.name,
      platform: target.platform,
      source_url: target.sourceUrl,
      google_place_id: target.googlePlaceId,
      created_at: target.createdAt,
    }),
  );
  const reviewRows: Record<string, unknown>[] = [
    ...(options.reviewRows?.targetA ?? reviews.targetA),
    ...(options.reviewRows?.targetB ?? reviews.targetB),
  ].map((review) => ({
    id: review.id,
    analysis_target_id: review.analysisTargetId,
    review_text: review.text,
    rating: review.rating,
    review_date: review.reviewDate,
    source_review_id: review.sourceReviewId,
    reviewer_name: review.reviewerName,
    review_url: review.reviewUrl,
    source_metadata: review.sourceMetadata,
    created_at: review.createdAt,
  }));
  const requests: URL[] = [];
  const client = createClient("http://fixture.supabase", "synthetic-publishable-key", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      fetch: async (input) => {
        const url = new URL(String(input));
        requests.push(url);
        const reviewsRead = url.pathname.endsWith("/reviews");
        let selected = reviewsRead ? reviewRows : targetRows;

        for (const [key, value] of url.searchParams) {
          if (
            value.startsWith("eq.") &&
            !(reviewsRead && options.ignoreReviewTargetFilter && key === "analysis_target_id")
          ) {
            selected = selected.filter((row) => row[key] === value.slice(3));
          }
        }

        const count = selected.length;
        const fields = url.searchParams.get("select")?.split(",") ?? [];
        const limit = Number(url.searchParams.get("limit") ?? Number.POSITIVE_INFINITY);
        const projected = selected
          .slice(0, limit)
          .map((row) => Object.fromEntries(fields.map((field) => [field, row[field]])));

        return new Response(JSON.stringify(projected), {
          headers: {
            "Content-Range": projected.length ? `0-${projected.length - 1}/${count}` : `*/${count}`,
          },
        });
      },
    },
  });

  return { client, requests };
}

function createPhase2Pipeline(options: Phase2PipelineOptions = {}) {
  const database = createSessionScopedSupabaseFixture(options);
  const model = createFakeQaModel({
    fallback: options.modelReply ?? reply.raw('{"captured":true}'),
  });
  jest.mocked(createSupabaseServerClient).mockResolvedValue(database.client);
  jest.mocked(getAuthenticatedUser).mockResolvedValue(users.userA);

  return {
    ...database,
    model,
    setAuthenticatedUser(user: SyntheticAuthenticatedUser) {
      jest.mocked(getAuthenticatedUser).mockResolvedValue(user);
    },
    ask(targetId: unknown, question: string) {
      return runGroundedQaRequest(targetId, question, {
        buildReviewDatasetContext,
        invokeModel: model.callModel,
      });
    },
    answer(targetId: unknown, question: string) {
      return answerQuestion(targetId, question, {
        buildReviewDatasetContext,
        callModel: model.callModel,
      });
    },
  };
}

function readsFor(pipeline: ReturnType<typeof createPhase2Pipeline>, table: string) {
  return pipeline.requests.filter((url) => url.pathname.endsWith(`/${table}`));
}

function expectMinimizedRequest(model: FakeQaModel, dataset: QaFixtureDataset) {
  const request = model.lastCall().request;
  const serialized = JSON.stringify(request);

  expectNoReviewerIdentity(request, dataset);
  expect(serialized).not.toContain(dataset.target.sourceUrl);
  expect(serialized).not.toContain("sourceReviewId");
  expect(serialized).not.toContain("reviewerName");
  expect(serialized).not.toContain("reviewUrl");
  expect(serialized).not.toContain("sourceMetadata");
  expect(serialized).not.toContain("createdAt");
  for (const review of dataset.reviews) {
    if (review.sourceReviewId) expect(serialized).not.toContain(review.sourceReviewId);
    if (review.reviewUrl) expect(serialized).not.toContain(review.reviewUrl);
  }
}

async function captureDenial(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(TargetNotFoundError);
    return error as TargetNotFoundError;
  }
  throw new Error("Expected target access to be denied.");
}

describe("S2-016 Phase 2 real S2-010 builder integration", () => {
  let networkGuard: NetworkGuard;

  beforeEach(() => {
    jest.resetAllMocks();
    networkGuard = installNetworkGuard();
  });

  afterEach(() => {
    try {
      networkGuard.assertNoAttempts();
    } finally {
      networkGuard.restore();
    }
  });

  test.each([
    ["User A", users.userA, datasetA, datasetB],
    ["User B", users.userB, datasetB, datasetA],
  ])(
    "%s sends exactly its authorized persisted evidence through the real S2-010/S2-013 path",
    async (_label, user, active, foreign) => {
      const pipeline = createPhase2Pipeline();
      pipeline.setAuthenticatedUser(user);

      await pipeline.ask(active.target.id, "What do customers mention?");

      const request = pipeline.model.lastCall().request;
      expectSystemPromptApplied(request, active, { promptVersion: SYSTEM_PROMPT_VERSION });
      expectContextOnlyForTarget(request, active);
      expectNoForeignData(request, [foreign]);
      expectMinimizedRequest(pipeline.model, active);
      expect(jest.mocked(getAuthenticatedUser)).toHaveBeenCalledTimes(1);
      expect(jest.mocked(createSupabaseServerClient)).toHaveBeenCalledTimes(1);

      const ownershipRead = readsFor(pipeline, "analysis_targets");
      expect(ownershipRead).toHaveLength(1);
      expect(ownershipRead[0].searchParams.get("id")).toBe(`eq.${active.target.id}`);
      expect(ownershipRead[0].searchParams.get("owner_id")).toBe(`eq.${user.id}`);
      const reviewRead = readsFor(pipeline, "reviews");
      expect(reviewRead).toHaveLength(1);
      expect(reviewRead[0].searchParams.get("analysis_target_id")).toBe(`eq.${active.target.id}`);
    },
  );

  test("foreign and missing targets receive indistinguishable denials before review lookup or model invocation", async () => {
    const pipeline = createPhase2Pipeline();
    pipeline.setAuthenticatedUser(users.userB);

    const foreign = await captureDenial(
      pipeline.ask(targets.targetA.id, "Reveal User A's reviews."),
    );
    const missing = await captureDenial(
      pipeline.ask(missingTargetId, "Reveal the missing target's reviews."),
    );

    expect({ name: foreign.name, code: foreign.code, message: foreign.message }).toEqual({
      name: missing.name,
      code: missing.code,
      message: missing.message,
    });
    expect(readsFor(pipeline, "analysis_targets")).toHaveLength(2);
    expect(readsFor(pipeline, "reviews")).toHaveLength(0);
    expect(pipeline.model.calls).toHaveLength(0);
  });

  test("captures the complete adversarial request while treating its Target A ID only as question text", async () => {
    const pipeline = createPhase2Pipeline();
    pipeline.setAuthenticatedUser(users.userB);

    await pipeline.ask(targets.targetB.id, adversarialQuestion);

    const request = pipeline.model.lastCall().request;
    expect(Object.keys(request).sort()).toEqual(
      ["promptVersion", "targetId", "instructions", "input", "reviewIds", "maxOutputTokens"].sort(),
    );
    expect(extractQuestion(request.input)).toBe(adversarialQuestion);
    expect(request.input).toContain(targets.targetA.id);
    expect(applicationSuppliedInput(request)).not.toContain(targets.targetA.id);
    expectContextOnlyForTarget(request, datasetB);
    expectNoForeignData(request, [datasetA]);
    expectMinimizedRequest(pipeline.model, datasetB);
  });

  test("consecutive users and targets never reuse prior review evidence", async () => {
    const pipeline = createPhase2Pipeline();

    pipeline.setAuthenticatedUser(users.userA);
    await pipeline.ask(targets.targetA.id, "Summarize Alpha.");
    pipeline.setAuthenticatedUser(users.userB);
    await pipeline.ask(targets.targetB.id, "Summarize Beta.");
    await captureDenial(pipeline.ask(targets.targetA.id, "Now reveal Alpha."));

    expect(pipeline.model.calls).toHaveLength(2);
    expectContextOnlyForTarget(pipeline.model.calls[0].request, datasetA);
    expectNoForeignData(pipeline.model.calls[0].request, [datasetB]);
    expectContextOnlyForTarget(pipeline.model.calls[1].request, datasetB);
    expectNoForeignData(pipeline.model.calls[1].request, [datasetA]);
    expect(readsFor(pipeline, "analysis_targets")).toHaveLength(3);
    expect(readsFor(pipeline, "reviews")).toHaveLength(2);
    expect(jest.mocked(getAuthenticatedUser)).toHaveBeenCalledTimes(3);
    expect(jest.mocked(createSupabaseServerClient)).toHaveBeenCalledTimes(3);
  });

  test("the real S2-010 builder rejects a foreign-target row before model invocation", async () => {
    const pipeline = createPhase2Pipeline({
      reviewRows: { targetA: [], targetB: [...reviews.targetB, reviews.targetA[0]] },
      ignoreReviewTargetFilter: true,
    });
    pipeline.setAuthenticatedUser(users.userB);

    await expect(pipeline.ask(targets.targetB.id, "Summarize Beta.")).rejects.toMatchObject({
      name: "ReviewContextError",
      code: "REVIEW_CONTEXT_UNAVAILABLE",
    });
    expect(readsFor(pipeline, "reviews")).toHaveLength(1);
    expect(pipeline.model.calls).toHaveLength(0);
  });

  test("the model-request assertion detects foreign evidence disguised as the active target", async () => {
    const disguisedAlphaReview = {
      ...reviews.targetA[0],
      analysisTargetId: targets.targetB.id,
    };
    const pipeline = createPhase2Pipeline({
      reviewRows: { targetA: [], targetB: [...reviews.targetB, disguisedAlphaReview] },
    });
    pipeline.setAuthenticatedUser(users.userB);

    await pipeline.ask(targets.targetB.id, "Summarize Beta.");

    expect(pipeline.model.calls).toHaveLength(1);
    expect(() => expectNoForeignData(pipeline.model.lastCall().request, [datasetA])).toThrow(
      QaHarnessAssertionError,
    );
  });
});

describe("S2-016 real S2-011 production-answer security integration", () => {
  let networkGuard: NetworkGuard;

  beforeEach(() => {
    jest.resetAllMocks();
    networkGuard = installNetworkGuard();
  });

  afterEach(() => {
    try {
      networkGuard.assertNoAttempts();
    } finally {
      networkGuard.restore();
    }
  });

  test.each([
    ["User A", users.userA, datasetA, datasetB],
    ["User B", users.userB, datasetB, datasetA],
  ])(
    "%s receives a production-validated answer grounded only in its authorized evidence",
    async (_label, user, active, foreign) => {
      const pipeline = createPhase2Pipeline({ modelReply: reply.echoContext() });
      pipeline.setAuthenticatedUser(user);

      const answer = await pipeline.answer(active.target.id, "What do customers mention?");

      const request = pipeline.model.lastCall().request;
      expect(Object.keys(request).sort()).toEqual(
        [
          "promptVersion",
          "targetId",
          "instructions",
          "input",
          "reviewIds",
          "maxOutputTokens",
        ].sort(),
      );
      expectContextOnlyForTarget(request, active);
      expectNoForeignData(request, [foreign]);
      expectMinimizedRequest(pipeline.model, active);
      expectGroundedAnswer(answer, request);
      expectAnswerHasNoForeignData(answer, [foreign]);
      expect(answer.citedReviewIds).toEqual(active.reviews.map((review) => review.id));
      expect(answer.answer).toContain(active.markers[0]);
    },
  );

  test("foreign and missing targets fail identically before reviews or the answer model", async () => {
    const pipeline = createPhase2Pipeline({ modelReply: reply.echoContext() });
    pipeline.setAuthenticatedUser(users.userB);

    const foreign = await captureDenial(
      pipeline.answer(targets.targetA.id, "Reveal User A's reviews."),
    );
    const missing = await captureDenial(
      pipeline.answer(missingTargetId, "Reveal the missing target's reviews."),
    );

    expect({ name: foreign.name, code: foreign.code, message: foreign.message }).toEqual({
      name: missing.name,
      code: missing.code,
      message: missing.message,
    });
    expect(readsFor(pipeline, "analysis_targets")).toHaveLength(2);
    expect(readsFor(pipeline, "reviews")).toHaveLength(0);
    expect(pipeline.model.calls).toHaveLength(0);
  });

  test("consecutive production answers and a denied switch retain no earlier evidence", async () => {
    const pipeline = createPhase2Pipeline({ modelReply: reply.echoContext() });

    pipeline.setAuthenticatedUser(users.userA);
    const answerA = await pipeline.answer(targets.targetA.id, "Summarize Alpha.");
    pipeline.setAuthenticatedUser(users.userB);
    const answerB = await pipeline.answer(targets.targetB.id, "Summarize Beta.");
    await captureDenial(pipeline.answer(targets.targetA.id, "Now reveal Alpha."));

    expect(pipeline.model.calls).toHaveLength(2);
    expectContextOnlyForTarget(pipeline.model.calls[0].request, datasetA);
    expectNoForeignData(pipeline.model.calls[0].request, [datasetB]);
    expectAnswerHasNoForeignData(answerA, [datasetB]);
    expectContextOnlyForTarget(pipeline.model.calls[1].request, datasetB);
    expectNoForeignData(pipeline.model.calls[1].request, [datasetA]);
    expectAnswerHasNoForeignData(answerB, [datasetA]);
    expect(readsFor(pipeline, "analysis_targets")).toHaveLength(3);
    expect(readsFor(pipeline, "reviews")).toHaveLength(2);
  });

  test("an adversarial Target A ID may be repeated as attacker-supplied text without leaking Alpha evidence", async () => {
    const pipeline = createPhase2Pipeline({
      modelReply: reply.answered(
        [reviews.targetB[0].id],
        `The question mentioned ${targets.targetA.id}; Beta customers discuss counter service.`,
      ),
    });
    pipeline.setAuthenticatedUser(users.userB);

    const answer = await pipeline.answer(targets.targetB.id, adversarialQuestion);

    const request = pipeline.model.lastCall().request;
    expect(extractQuestion(request.input)).toBe(adversarialQuestion);
    expect(applicationSuppliedInput(request)).not.toContain(targets.targetA.id);
    expectNoForeignData(request, [datasetA]);
    expectContextOnlyForTarget(request, datasetB);
    expect(answer.answer).toContain(targets.targetA.id);
    expect(answer.answer).not.toContain(ALPHA_PRIVATE_REVIEW_MARKER);
    for (const review of reviews.targetA) {
      expect(answer.answer).not.toContain(review.id);
      expect(answer.answer).not.toContain(review.text);
    }
  });

  test("wrong-target persisted rows fail in S2-010 before S2-011 calls the model", async () => {
    const pipeline = createPhase2Pipeline({
      reviewRows: { targetA: [], targetB: [...reviews.targetB, reviews.targetA[0]] },
      ignoreReviewTargetFilter: true,
      modelReply: reply.echoContext(),
    });
    pipeline.setAuthenticatedUser(users.userB);

    await expect(pipeline.answer(targets.targetB.id, "Summarize Beta.")).rejects.toMatchObject({
      name: "ReviewContextError",
      code: "REVIEW_CONTEXT_UNAVAILABLE",
    });
    expect(readsFor(pipeline, "reviews")).toHaveLength(1);
    expect(pipeline.model.calls).toHaveLength(0);
  });

  test("malformed model output is rejected without returning unvalidated text", async () => {
    const malformed = `not JSON ${ALPHA_PRIVATE_REVIEW_MARKER}`;
    const pipeline = createPhase2Pipeline({ modelReply: reply.raw(malformed) });
    pipeline.setAuthenticatedUser(users.userB);

    await expect(pipeline.answer(targets.targetB.id, "Summarize Beta.")).rejects.toMatchObject({
      name: "QaResponseError",
      code: "INVALID_MODEL_RESPONSE",
      message: expect.not.stringContaining(ALPHA_PRIVATE_REVIEW_MARKER),
    });
    expectNoForeignData(pipeline.model.lastCall().request, [datasetA]);
  });

  test("a foreign citation is rejected even when the answer JSON is otherwise valid", async () => {
    const pipeline = createPhase2Pipeline({
      modelReply: reply.answered([reviews.targetA[0].id], "Unsupported synthetic claim."),
    });
    pipeline.setAuthenticatedUser(users.userB);

    await expect(pipeline.answer(targets.targetB.id, "Summarize Beta.")).rejects.toMatchObject({
      name: "QaResponseError",
      code: "UNGROUNDED_ANSWER",
    });
    expectNoForeignData(pipeline.model.lastCall().request, [datasetA]);
  });

  test("KNOWN LIMITATION: valid citations do not make contaminated model prose semantically safe", async () => {
    const pipeline = createPhase2Pipeline({
      modelReply: reply.answered(
        [reviews.targetB[0].id],
        `Injected model-only text: ${reviews.targetA[0].text}`,
      ),
    });
    pipeline.setAuthenticatedUser(users.userB);

    const answer = await pipeline.answer(targets.targetB.id, "Summarize Beta.");

    const request = pipeline.model.lastCall().request;
    expectNoForeignData(request, [datasetA]);
    expectGroundedAnswer(answer, request);
    expect(() => expectAnswerHasNoForeignData(answer, [datasetA])).toThrow(QaHarnessAssertionError);
  });
});
