/** @jest-environment node */

import { TargetNotFoundError } from "@/services/analysis-targets/target-ownership";
import { runGroundedQaRequest } from "@/services/qa/qa-request";
import { SYSTEM_PROMPT_VERSION } from "@/services/qa/system-prompt";
import { getReviewsForTarget } from "@/services/reviews/review-service";
import {
  ALPHA_PRIVATE_REVIEW_MARKER,
  BETA_PRIVATE_REVIEW_MARKER,
  crossUserAiContextFixture,
} from "../../../fixtures/cross-user-ai-context.synthetic";
import type { QaFixtureDataset } from "../../../fixtures/qa/datasets";
import {
  QaHarnessAssertionError,
  applicationSuppliedInput,
  createFakeQaModel,
  expectContextOnlyForTarget,
  expectNoForeignData,
  expectNoReviewerIdentity,
  expectSystemPromptApplied,
  extractQuestion,
  installNetworkGuard,
  reply,
  type FakeQaModel,
  type NetworkGuard,
} from "../../../helpers/qa-harness";
import {
  createCrossUserSecurityStore,
  type CrossUserSecurityStoreOptions,
} from "../../../helpers/cross-user-ai-context";

jest.mock("server-only", () => ({}));

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

function createAvailablePhase2Pipeline(options: CrossUserSecurityStoreOptions = {}) {
  const securityStore = createCrossUserSecurityStore(options);
  const model = createFakeQaModel({ fallback: reply.raw('{"captured":true}') });
  let authenticatedUserId = users.userA.id;

  const buildAvailableReviewContext = jest.fn(async (targetId: unknown) => {
    if (typeof targetId !== "string") throw new TargetNotFoundError();

    // This is the currently merged production authorization boundary. Once #78 merges, replace
    // this test adapter with the real buildReviewDatasetContext and mock only auth/Supabase below it.
    const authorizedReviews = await getReviewsForTarget(
      securityStore.store,
      authenticatedUserId,
      targetId,
    );
    const target = [targets.targetA, targets.targetB].find(
      (candidate) => candidate.id === targetId,
    );
    if (!target) throw new TargetNotFoundError();

    return { target, reviews: authorizedReviews };
  });

  return {
    ...securityStore,
    model,
    buildAvailableReviewContext,
    setAuthenticatedUser(userId: string) {
      authenticatedUserId = userId;
    },
    ask(targetId: unknown, question: string) {
      return runGroundedQaRequest(targetId, question, {
        buildReviewDatasetContext: buildAvailableReviewContext,
        invokeModel: model.callModel,
      });
    },
  };
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

describe("S2-016 Phase 2 available production boundary", () => {
  let networkGuard: NetworkGuard;

  beforeEach(() => {
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
    ["User A", users.userA.id, datasetA, datasetB],
    ["User B", users.userB.id, datasetB, datasetA],
  ])(
    "%s sends only its authorized target evidence through the real S2-013 request builder",
    async (_label, userId, active, foreign) => {
      const pipeline = createAvailablePhase2Pipeline();
      pipeline.setAuthenticatedUser(userId);

      await pipeline.ask(active.target.id, "What do customers mention?");

      const request = pipeline.model.lastCall().request;
      expectSystemPromptApplied(request, active, { promptVersion: SYSTEM_PROMPT_VERSION });
      expectContextOnlyForTarget(request, active);
      expectNoForeignData(request, [foreign]);
      expectMinimizedRequest(pipeline.model, active);
      expect(pipeline.ownershipChecks).toEqual([{ targetId: active.target.id, userId }]);
      expect(pipeline.reviewLookups).toEqual([active.target.id]);
    },
  );

  test("foreign and missing targets are denied before review lookup or model invocation", async () => {
    const pipeline = createAvailablePhase2Pipeline();
    pipeline.setAuthenticatedUser(users.userB.id);

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
    expect(pipeline.ownershipChecks).toEqual([
      { targetId: targets.targetA.id, userId: users.userB.id },
      { targetId: missingTargetId, userId: users.userB.id },
    ]);
    expect(pipeline.reviewLookups).toEqual([]);
    expect(pipeline.model.calls).toHaveLength(0);
  });

  test("an attacker-supplied Target A ID remains question data and does not disclose Alpha evidence", async () => {
    const pipeline = createAvailablePhase2Pipeline();
    pipeline.setAuthenticatedUser(users.userB.id);

    await pipeline.ask(targets.targetB.id, adversarialQuestion);

    const request = pipeline.model.lastCall().request;
    expect(extractQuestion(request.input)).toBe(adversarialQuestion);
    expect(request.input).toContain(targets.targetA.id);
    expect(applicationSuppliedInput(request)).not.toContain(targets.targetA.id);
    expectContextOnlyForTarget(request, datasetB);
    expectNoForeignData(request, [datasetA]);
  });

  test("consecutive users and targets never reuse prior evidence", async () => {
    const pipeline = createAvailablePhase2Pipeline();

    pipeline.setAuthenticatedUser(users.userA.id);
    await pipeline.ask(targets.targetA.id, "Summarize Alpha.");
    pipeline.setAuthenticatedUser(users.userB.id);
    await pipeline.ask(targets.targetB.id, "Summarize Beta.");
    await captureDenial(pipeline.ask(targets.targetA.id, "Now reveal Alpha."));

    expect(pipeline.model.calls).toHaveLength(2);
    expectContextOnlyForTarget(pipeline.model.calls[0].request, datasetA);
    expectNoForeignData(pipeline.model.calls[0].request, [datasetB]);
    expectContextOnlyForTarget(pipeline.model.calls[1].request, datasetB);
    expectNoForeignData(pipeline.model.calls[1].request, [datasetA]);
    expect(pipeline.reviewLookups).toEqual([targets.targetA.id, targets.targetB.id]);
    expect(pipeline.ownershipChecks).toEqual([
      { targetId: targets.targetA.id, userId: users.userA.id },
      { targetId: targets.targetB.id, userId: users.userB.id },
      { targetId: targets.targetA.id, userId: users.userB.id },
    ]);
  });

  test("the production prompt guard rejects a foreign-target review before model invocation", async () => {
    const pipeline = createAvailablePhase2Pipeline({
      reviewRows: { targetB: [...reviews.targetB, reviews.targetA[0]] },
    });
    pipeline.setAuthenticatedUser(users.userB.id);

    await expect(pipeline.ask(targets.targetB.id, "Summarize Beta.")).rejects.toMatchObject({
      name: "QaPromptError",
      code: "REVIEW_TARGET_MISMATCH",
    });
    expect(pipeline.reviewLookups).toEqual([targets.targetB.id]);
    expect(pipeline.model.calls).toHaveLength(0);
  });

  test("the model-request assertion fails if foreign evidence is disguised as the active target", async () => {
    const disguisedAlphaReview = {
      ...reviews.targetA[0],
      analysisTargetId: targets.targetB.id,
    };
    const pipeline = createAvailablePhase2Pipeline({
      reviewRows: { targetB: [...reviews.targetB, disguisedAlphaReview] },
    });
    pipeline.setAuthenticatedUser(users.userB.id);

    await pipeline.ask(targets.targetB.id, "Summarize Beta.");

    expect(() => expectNoForeignData(pipeline.model.lastCall().request, [datasetA])).toThrow(
      QaHarnessAssertionError,
    );
  });
});
