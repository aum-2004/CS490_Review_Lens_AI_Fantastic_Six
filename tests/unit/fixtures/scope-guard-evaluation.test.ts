/** @jest-environment node */

import {
  SCOPE_GUARD_EXPECTED_CATEGORIES,
  scopeGuardEvaluationFixture,
} from "../../fixtures/scope-guard-evaluation";

const requiredExpectedCategories = [
  "answer_from_active_reviews",
  "insufficient_review_evidence",
  "decline_unrelated_general_knowledge",
  "decline_other_entity_or_product",
  "decline_other_review_platform",
] as const;

describe("scope-guard evaluation fixture", () => {
  const { activeTarget, persistedReviews, cases } = scopeGuardEvaluationFixture;

  test("uses one synthetic Google Maps target and persisted reviews tied to it", () => {
    expect(activeTarget).toMatchObject({ name: "Restaurant A", platform: "google_maps" });
    expect(persistedReviews).toHaveLength(4);
    expect(persistedReviews.every((review) => review.analysisTargetId === activeTarget.id)).toBe(
      true,
    );
    expect(new Set(persistedReviews.map(({ id }) => id)).size).toBe(persistedReviews.length);
  });

  test("gives every case the required non-empty fields", () => {
    for (const evaluationCase of cases) {
      expect(Object.keys(evaluationCase)).toEqual([
        "id",
        "question",
        "expectedCategory",
        "explanation",
      ]);
      expect(evaluationCase.id.trim()).not.toBe("");
      expect(evaluationCase.question.trim()).not.toBe("");
      expect(evaluationCase.explanation.trim()).not.toBe("");
    }
  });

  test("uses unique stable IDs and unique questions", () => {
    const ids = cases.map(({ id }) => id);
    const questions = cases.map(({ question }) => question);

    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(questions).size).toBe(questions.length);
    expect(ids.every((id) => /^sg-[a-z-]+-\d{3}$/.test(id))).toBe(true);
  });

  test("uses only the declared expected behavioral categories", () => {
    expect(SCOPE_GUARD_EXPECTED_CATEGORIES).toEqual(requiredExpectedCategories);

    const allowedCategories = new Set<string>(requiredExpectedCategories);

    expect(cases.every(({ expectedCategory }) => allowedCategories.has(expectedCategory))).toBe(
      true,
    );
  });

  test.each(requiredExpectedCategories)(
    "includes at least three cases for %s",
    (expectedCategory) => {
      expect(
        cases.filter((item) => item.expectedCategory === expectedCategory).length,
      ).toBeGreaterThanOrEqual(3);
    },
  );

  test("contains every required expected behavioral category", () => {
    expect(new Set(cases.map(({ expectedCategory }) => expectedCategory))).toEqual(
      new Set(requiredExpectedCategories),
    );
  });
});
