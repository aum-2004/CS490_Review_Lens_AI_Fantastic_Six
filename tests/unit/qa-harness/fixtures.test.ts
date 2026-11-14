/** @jest-environment node */

import { scopeGuardEvaluationFixture } from "../../fixtures/scope-guard-evaluation";
import {
  allQaDatasets,
  getQaDataset,
  QA_DATASET_KEYS,
  QA_DATASETS,
  QA_MISSING_TARGET_ID,
  QA_USERS,
} from "../../fixtures/qa/datasets";
import { QA_GOLDEN_CASES, QA_GOLDEN_SCENARIOS } from "../../fixtures/qa/golden-cases";

const isoTimestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const validDatasets = allQaDatasets().filter((dataset) => dataset.key !== "malformedRows");

describe("QA fixture datasets", () => {
  it("are keyed consistently", () => {
    expect(Object.keys(QA_DATASETS).sort()).toEqual([...QA_DATASET_KEYS].sort());
    for (const key of QA_DATASET_KEYS) expect(getQaDataset(key).key).toBe(key);
  });

  it("are deep-frozen so tests cannot change shared data", () => {
    const dataset = getQaDataset("targetA");
    expect(Object.isFrozen(dataset)).toBe(true);
    expect(Object.isFrozen(dataset.reviews)).toBe(true);
    expect(Object.isFrozen(dataset.reviews[0])).toBe(true);
    expect(() => {
      (dataset.reviews as unknown as unknown[]).push({});
    }).toThrow(TypeError);
  });

  it("do not freeze or alter the shared S2-004 fixture they reuse", () => {
    expect(Object.isFrozen(scopeGuardEvaluationFixture.persistedReviews[0])).toBe(false);
    expect(getQaDataset("restaurantA").reviews).toEqual(
      scopeGuardEvaluationFixture.persistedReviews,
    );
  });

  it("use unique target and review IDs across datasets, and never the missing ID", () => {
    const targetIds = allQaDatasets().map((dataset) => dataset.target.id);
    expect(new Set(targetIds).size).toBe(targetIds.length);
    expect(targetIds).not.toContain(QA_MISSING_TARGET_ID);

    const reviewIds = validDatasets.flatMap((dataset) =>
      dataset.reviews.map((review) => review.id),
    );
    expect(new Set(reviewIds).size).toBe(reviewIds.length);
  });

  it("only contain reviews belonging to their own target and owner", () => {
    for (const dataset of allQaDatasets()) {
      expect(dataset.target.ownerId).toBe(dataset.owner.id);
      for (const review of dataset.reviews) expect(review.analysisTargetId).toBe(dataset.target.id);
    }
  });

  it("use fixed ISO timestamps and valid ratings in every valid dataset", () => {
    for (const dataset of validDatasets) {
      expect(dataset.target.createdAt).toMatch(isoTimestamp);
      for (const review of dataset.reviews) {
        expect(review.reviewDate).toMatch(isoTimestamp);
        expect(review.createdAt).toMatch(isoTimestamp);
        expect(review.rating).toBeGreaterThanOrEqual(1);
        expect(review.rating).toBeLessThanOrEqual(5);
        expect(review.text.trim()).not.toBe("");
      }
    }
  });

  it("place each marker only in its own dataset", () => {
    for (const dataset of allQaDatasets()) {
      for (const marker of dataset.markers) {
        const holders = allQaDatasets().filter((other) =>
          other.reviews.some((review) => review.text.includes(marker)),
        );
        expect(holders.map((holder) => holder.key)).toEqual([dataset.key]);
      }
    }
  });

  it("cover the required shapes", () => {
    expect(getQaDataset("emptyTarget").reviews).toHaveLength(0);
    expect(new Set(getQaDataset("mixedRatings").reviews.map((review) => review.rating))).toEqual(
      new Set([1, 2, 3, 4, 5]),
    );
    expect(getQaDataset("targetA").owner).toBe(getQaDataset("targetB").owner);
    expect(getQaDataset("userBPrivate").owner).toEqual(QA_USERS.userB);

    const malformed = getQaDataset("malformedRows").reviews;
    const ids = malformed.map((review) => review.id);
    expect(new Set(ids).size).toBeLessThan(ids.length);
    expect(malformed.some((review) => review.text.trim() === "")).toBe(true);
    expect(malformed.some((review) => review.rating < 1 || review.rating > 5)).toBe(true);
  });
});

describe("QA golden cases", () => {
  it("have unique IDs and at least one step each", () => {
    const ids = QA_GOLDEN_CASES.map((goldenCase) => goldenCase.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const goldenCase of QA_GOLDEN_CASES) expect(goldenCase.steps.length).toBeGreaterThan(0);
  });

  it("cover every scenario", () => {
    const covered = new Set(QA_GOLDEN_CASES.map((goldenCase) => goldenCase.scenario));
    expect([...covered].sort()).toEqual([...QA_GOLDEN_SCENARIOS].sort());
  });

  it("script a model reply exactly when the model is expected to be called", () => {
    for (const goldenCase of QA_GOLDEN_CASES) {
      for (const step of goldenCase.steps) {
        const expectsCall = step.expect.result !== "error" || step.expect.modelCalled;
        expect({ id: goldenCase.id, hasReply: step.reply !== undefined }).toEqual({
          id: goldenCase.id,
          hasReply: expectsCall,
        });
      }
    }
  });

  it("include multi-step target switch, stale context and cross-user cases", () => {
    for (const scenario of ["target_switch", "stale_context", "cross_user_leak"] as const) {
      const cases = QA_GOLDEN_CASES.filter((goldenCase) => goldenCase.scenario === scenario);
      expect(
        cases.some((goldenCase) => new Set(goldenCase.steps.map((step) => step.target)).size > 1),
      ).toBe(true);
    }
    const crossUser = QA_GOLDEN_CASES.filter(
      (goldenCase) => goldenCase.scenario === "cross_user_leak",
    );
    expect(
      new Set(crossUser.flatMap((goldenCase) => goldenCase.steps.map((step) => step.actor))),
    ).toEqual(new Set(["userA", "userB"]));
  });
});
