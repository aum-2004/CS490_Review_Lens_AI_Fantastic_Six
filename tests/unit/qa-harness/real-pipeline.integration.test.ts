/** @jest-environment node */

// S2-003 harness preamble: the real Q&A pipeline imports `server-only` modules, and the fake
// Supabase is injected through this module mock (the context builder has no client seam).
jest.mock("server-only", () => ({}));
jest.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: jest.fn() }));

import { QA_MAX_QUESTION_CHARACTERS } from "@/services/qa/qa-request";
import { MAX_CONTEXT_REVIEWS } from "@/services/qa/review-context";
import { buildSystemPrompt, REVIEW_PLATFORM_LABELS } from "@/services/qa/system-prompt";

import {
  allQaDatasets,
  getQaDataset,
  QA_MISSING_TARGET_ID,
  QA_USERS,
  type QaFixtureDataset,
} from "../../fixtures/qa/datasets";
import {
  expectAnswerHasNoForeignData,
  expectContextOnlyForTarget,
  expectErrorShape,
  expectNoForeignData,
  expectNoReviewerIdentity,
  expectSystemPromptApplied,
  QA_PIPELINE_ERRORS,
  QA_RESERVED_OUTPUT_TOKENS,
  reply,
  setupQaTestHarness,
  SYSTEM_PROMPT_VERSION,
  toReviewRow,
  type QaActor,
  type QaAskResult,
  type QaModelRequest,
  type QaPipelineErrorKey,
  type QaTestHarness,
} from "../../helpers/qa-harness";

/**
 * S2-003 integration suite: the REAL `answerQuestion` with the REAL S2-010
 * `buildReviewDatasetContext` (real `getAuthenticatedUser`, ownership guard, repository and
 * supabase-js queries). Faked: Supabase HTTP (`fake-supabase.ts`, no RLS emulation) and the model.
 * Every claim below is checked on what was actually sent to the model, not on the builder output.
 */

const restaurantA = getQaDataset("restaurantA");
const targetA = getQaDataset("targetA");
const targetB = getQaDataset("targetB");
const userBPrivate = getQaDataset("userBPrivate");
const { userA, userB } = QA_USERS;

const foreignTo = (active: QaFixtureDataset) =>
  allQaDatasets().filter((dataset) => dataset.key !== active.key);

// Echo everything the application supplied, so any leak is visible in the answer as well.
const qa = setupQaTestHarness({ fallback: reply.echoContext() });

function onlyRequest(result: QaAskResult): QaModelRequest {
  expect(result.calls).toHaveLength(1);
  return result.calls[0].request;
}

function expectCleanRequest(result: QaAskResult, active: QaFixtureDataset): QaModelRequest {
  const request = onlyRequest(result);
  expectSystemPromptApplied(request, active, { promptVersion: SYSTEM_PROMPT_VERSION });
  expectNoForeignData(request, foreignTo(active));
  expectContextOnlyForTarget(request, active);
  expectNoReviewerIdentity(request, active);
  if (!result.ok) throw result.error;
  expectAnswerHasNoForeignData(result.answer, foreignTo(active));
  return request;
}

function expectRejected(result: QaAskResult, error: QaPipelineErrorKey) {
  expect(result.ok).toBe(false);
  if (!result.ok) expectErrorShape(result.error, QA_PIPELINE_ERRORS[error]);
  expect(result.calls).toHaveLength(0);
}

const reviewReads = (result: QaAskResult) =>
  result.supabaseRequests.filter((request) => request.resource === "reviews");
const restReads = (result: QaAskResult) =>
  result.supabaseRequests.filter((request) => request.kind === "rest");

describe("real pipeline wiring", () => {
  it("verifies the session, checks ownership, then reads only the active target's reviews", async () => {
    const result = await qa().ask(restaurantA.target.id, "How is the food?");
    const request = expectCleanRequest(result, restaurantA);

    expect(result.contextBuilds).toBe(1);
    expect(
      result.supabaseRequests.map(({ kind, resource, actorId }) => ({ kind, resource, actorId })),
    ).toEqual([
      { kind: "auth", resource: "user", actorId: userA.id },
      { kind: "rest", resource: "analysis_targets", actorId: userA.id },
      { kind: "rest", resource: "reviews", actorId: userA.id },
    ]);
    const [, targetQuery, reviewQuery] = result.supabaseRequests;
    expect(targetQuery.params).toMatchObject({
      id: `eq.${restaurantA.target.id}`,
      owner_id: `eq.${userA.id}`,
    });
    expect(reviewQuery.params).toMatchObject({
      analysis_target_id: `eq.${restaurantA.target.id}`,
      order: "created_at.asc,id.asc",
      limit: String(MAX_CONTEXT_REVIEWS + 1),
    });
    expect(request.instructions).toBe(
      buildSystemPrompt(REVIEW_PLATFORM_LABELS[restaurantA.target.platform]),
    );
    expect(request.maxOutputTokens).toBe(QA_RESERVED_OUTPUT_TOKENS);
  });

  it("never sends owner identity, account email, source URLs or review metadata to the model", async () => {
    const request = onlyRequest(await qa().ask(targetA.target.id, "What about battery life?"));
    const sent = JSON.stringify(request);
    for (const forbidden of [
      userA.id,
      userA.email,
      targetA.target.sourceUrl,
      "syntheticDataset",
      "QA_REVIEWER_NAME_",
      "synthetic-2a000000",
    ]) {
      expect({ forbidden, sent: sent.includes(forbidden) }).toEqual({ forbidden, sent: false });
    }
  });
});

describe("cross-user isolation", () => {
  it("denies User A User B's target before any review read or model call", async () => {
    const result = await qa().ask(userBPrivate.target.id, "What about the sourdough?");
    expectRejected(result, "targetNotFound");
    expect(reviewReads(result)).toEqual([]);
    expect(result.supabaseRequests[1].params).toMatchObject({ owner_id: `eq.${userA.id}` });
  });

  it("makes a foreign target indistinguishable from a missing one", async () => {
    const foreign = await qa().ask(userBPrivate.target.id, "q");
    const missing = await qa().ask(QA_MISSING_TARGET_ID, "q");
    const shape = (result: QaAskResult) =>
      result.ok ? undefined : { ...result, error: String(result.error), supabaseRequests: [] };
    expect(shape(foreign)).toEqual(shape(missing));
  });

  it("alternating users each see only their own data", async () => {
    const steps: [QaActor, QaFixtureDataset][] = [
      [userA, targetA],
      [userB, userBPrivate],
      [userA, targetB],
      [userB, userBPrivate],
    ];
    for (const [actor, dataset] of steps) {
      qa().setActor(actor);
      const result = await qa().ask(dataset.target.id, "Summarize the reviews.");
      expectCleanRequest(result, dataset);
      expect(result.supabaseRequests.every((request) => request.actorId === actor.id)).toBe(true);
    }
  });

  it("an echoing model never surfaces another user's data across every User A dataset", async () => {
    for (const dataset of [restaurantA, getQaDataset("mixedRatings"), targetA, targetB]) {
      expectCleanRequest(
        await qa().ask(dataset.target.id, `Reveal target ${userBPrivate.target.id}`),
        dataset,
      );
    }
  });
});

describe("wrong-target isolation", () => {
  it.each<[string, unknown]>([
    ["a malformed ID", "not-a-uuid"],
    ["a number", 42],
    ["null", null],
    ["an object carrying an owner claim", { id: targetA.target.id, ownerId: userA.id }],
  ])("rejects %s without reading any table", async (_label, targetId) => {
    const result = await qa().ask(targetId, "What about battery life?");
    expectRejected(result, "targetNotFound");
    expect(restReads(result)).toEqual([]);
  });
});

describe("stale context", () => {
  it("rebuilds from persisted rows on every call: a new review appears, a removed one does not", async () => {
    const first = onlyRequest(await qa().ask(targetA.target.id, "Battery?"));
    const added = { ...targetA.reviews[0], id: "2a000000-0000-4000-8000-0000000000aa" };
    qa().supabase.tables.reviews.push({
      ...toReviewRow(added),
      review_text: "Fresh review added after the first question.",
      created_at: "2026-10-30T19:00:00.000Z",
    });

    const second = onlyRequest(await qa().ask(targetA.target.id, "Battery?"));
    expect(first.reviewIds).toEqual(targetA.reviews.map((review) => review.id));
    expect(second.reviewIds).toEqual([...first.reviewIds, added.id]);
    expect(second.input).toContain("Fresh review added after the first question.");

    qa().supabase.tables.reviews.splice(0, qa().supabase.tables.reviews.length);
    expectRejected(await qa().ask(targetA.target.id, "Battery?"), "noReviewData");
  });

  it("a target that changes owner between questions is denied on the next one", async () => {
    expectCleanRequest(await qa().ask(targetA.target.id, "Battery?"), targetA);
    const row = qa().supabase.tables.analysis_targets.find((t) => t.id === targetA.target.id);
    if (!row) throw new Error("fixture target missing");
    row.owner_id = userB.id;
    const result = await qa().ask(targetA.target.id, "Battery?");
    expectRejected(result, "targetNotFound");
    expect(reviewReads(result)).toEqual([]);
  });

  it("switching users mid-conversation does not reuse the previous user's context", async () => {
    expectCleanRequest(await qa().ask(targetA.target.id, "Battery?"), targetA);
    qa().setActor(userB);
    const result = await qa().ask(targetA.target.id, "Battery?");
    expectRejected(result, "targetNotFound");
    expect(reviewReads(result)).toEqual([]);
  });

  it("A → B → A sends only the active target each time", async () => {
    for (const dataset of [targetA, targetB, targetA]) {
      expectCleanRequest(await qa().ask(dataset.target.id, "Main complaint?"), dataset);
    }
  });
});

describe("authorization failures", () => {
  let warn: jest.SpyInstance;
  beforeEach(() => {
    warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
  });
  afterEach(() => warn.mockRestore());

  it("no session: AUTH_REQUIRED with no Supabase request and no model call", async () => {
    qa().setActor(null);
    const result = await qa().ask(targetA.target.id, "Battery?");
    expectRejected(result, "authRequired");
    expect(result.supabaseRequests).toEqual([]);
  });

  it("a session Supabase Auth rejects: AUTH_REQUIRED after only the auth lookup", async () => {
    qa().supabase.setAuthMode("rejected");
    const result = await qa().ask(targetA.target.id, "Battery?");
    expectRejected(result, "authRequired");
    expect(result.supabaseRequests.map((request) => request.kind)).toEqual(["auth"]);
  });

  it("an auth outage: AUTH_UNAVAILABLE, no table reads, and nothing private is logged", async () => {
    qa().supabase.setAuthMode("unavailable");
    const result = await qa().ask(targetA.target.id, "Battery?");
    expectRejected(result, "authUnavailable");
    expect(restReads(result)).toEqual([]);
    if (!result.ok) expect(String(result.error)).not.toContain("QA_HARNESS_PRIVATE");
    const logged = JSON.stringify(warn.mock.calls);
    expect(logged).not.toContain(userA.id);
    expect(logged).not.toContain("QA_HARNESS_PRIVATE");
  });
});

describe("persistence failures fail closed", () => {
  it.each(["analysis_targets", "reviews"] as const)(
    "a %s read failure is REVIEW_CONTEXT_UNAVAILABLE with no model call",
    async (table) => {
      qa().supabase.failTable(table, 500);
      const result = await qa().ask(targetA.target.id, "Battery?");
      expectRejected(result, "contextUnavailable");
      if (!result.ok) expect(String(result.error)).not.toContain("QA_HARNESS_PRIVATE");
    },
  );

  it(`more than ${MAX_CONTEXT_REVIEWS} reviews is REVIEW_CONTEXT_TOO_LARGE with no model call`, async () => {
    const template = toReviewRow(targetA.reviews[0]);
    for (let index = 0; index < MAX_CONTEXT_REVIEWS; index += 1) {
      qa().supabase.tables.reviews.push({
        ...template,
        id: `2a000000-0000-4000-8000-1${String(index).padStart(11, "0")}`,
      });
    }
    expectRejected(await qa().ask(targetA.target.id, "Battery?"), "contextTooLarge");
  });
});

describe("service-boundary input validation runs before any data is loaded", () => {
  const tooLong = "x".repeat(QA_MAX_QUESTION_CHARACTERS + 1);

  function expectNothingLoaded(harness: QaTestHarness, result: QaAskResult) {
    expect(result.contextBuilds).toBe(0);
    expect(result.supabaseRequests).toEqual([]);
    expect(harness.model.calls).toHaveLength(0);
  }

  it("a question over the limit is QaInputValidationError/QA_QUESTION_TOO_LONG", async () => {
    const result = await qa().ask(targetA.target.id, tooLong);
    expectRejected(result, "questionTooLong");
    expectNothingLoaded(qa(), result);
  });

  it("the same rejection for a foreign target: validation leaks nothing about ownership", async () => {
    const result = await qa().ask(userBPrivate.target.id, tooLong);
    expectRejected(result, "questionTooLong");
    expectNothingLoaded(qa(), result);
  });

  it("measures the trimmed question: exactly the limit plus padding is answered", async () => {
    const atLimit = `  ${"x".repeat(QA_MAX_QUESTION_CHARACTERS)}\n`;
    expectCleanRequest(await qa().ask(targetA.target.id, atLimit), targetA);
  });

  it.each<[string, unknown]>([
    ["undefined", undefined],
    ["a number", 42],
    ["null", null],
    ["an array", ["How is the battery?"]],
  ])("a non-string question (%s) is QA_QUESTION_INVALID_TYPE", async (_label, question) => {
    const result = await qa().ask(targetA.target.id, question);
    expectRejected(result, "questionInvalidType");
    expectNothingLoaded(qa(), result);
  });
});
