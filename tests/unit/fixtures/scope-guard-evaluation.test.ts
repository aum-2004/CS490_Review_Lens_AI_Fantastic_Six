/** @jest-environment node */

import { normalizeReview } from "@/services/reviews/normalize";
import { MAX_RATING, MIN_RATING } from "@/services/reviews/types";
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

const idPrefixesToCategories = [
  ["sg-in-scope-", "answer_from_active_reviews"],
  ["sg-insufficient-", "insufficient_review_evidence"],
  ["sg-general-", "decline_unrelated_general_knowledge"],
  ["sg-other-entity-", "decline_other_entity_or_product"],
  ["sg-other-platform-", "decline_other_review_platform"],
] as const;

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const timestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

describe("scope-guard evaluation fixture", () => {
  const { activeTarget, persistedReviews, cases } = scopeGuardEvaluationFixture;

  test("has a synthetic owned Google Maps target and related persisted reviews", () => {
    expect(activeTarget.name).toBe("Restaurant A");
    expect(activeTarget.platform).toBe("google_maps");
    expect(activeTarget.id).toMatch(uuidPattern);
    expect(activeTarget.ownerId).toMatch(uuidPattern);
    expect(activeTarget.id).not.toBe(activeTarget.ownerId);
    expect(persistedReviews).toHaveLength(4);
    expect(
      persistedReviews.every(({ analysisTargetId }) => analysisTargetId === activeTarget.id),
    ).toBe(true);
    expect(new Set(persistedReviews.map(({ id }) => id)).size).toBe(persistedReviews.length);
  });

  test("persists only valid synthetic reviews with explicit timestamp normalization", () => {
    for (const review of persistedReviews) {
      expect(review.id).toMatch(uuidPattern);
      expect(review.text.trim()).not.toBe("");
      expect(review.rating).toBeGreaterThanOrEqual(MIN_RATING);
      expect(review.rating).toBeLessThanOrEqual(MAX_RATING);
      expect(review.reviewDate).toMatch(timestampPattern);
      expect(review.createdAt).toMatch(timestampPattern);

      const normalized = normalizeReview({
        text: review.text,
        rating: review.rating,
        reviewDate: review.reviewDate,
        sourceReviewId: review.sourceReviewId,
        reviewerName: review.reviewerName,
        reviewUrl: review.reviewUrl,
      });

      expect(normalized.ok).toBe(true);
      if (normalized.ok) {
        expect(normalized.review.reviewDate?.toISOString()).toBe(review.reviewDate);
        expect(normalized.review.text).toBe(review.text);
        expect(normalized.review.rating).toBe(review.rating);
      }
    }
  });

  test("gives every case non-empty required fields without relying on object key order", () => {
    for (const evaluationCase of cases) {
      expect(evaluationCase).toEqual(
        expect.objectContaining({
          id: expect.any(String),
          question: expect.any(String),
          expectedCategory: expect.any(String),
          explanation: expect.any(String),
          expectedReviewIds: expect.any(Array),
        }),
      );
      expect(evaluationCase.id.trim()).not.toBe("");
      expect(evaluationCase.question.trim()).not.toBe("");
      expect(evaluationCase.explanation.trim()).not.toBe("");
    }
  });

  test("uses unique stable IDs and distinct questions", () => {
    const ids = cases.map(({ id }) => id);
    const questions = cases.map(({ question }) => question);

    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(questions).size).toBe(questions.length);
    expect(ids.every((id) => /^sg-[a-z-]+-\d{3}$/.test(id))).toBe(true);
  });

  test("uses the independently declared required behavioral categories", () => {
    expect(SCOPE_GUARD_EXPECTED_CATEGORIES).toEqual(requiredExpectedCategories);
    const allowed = new Set<string>(requiredExpectedCategories);
    expect(cases.every(({ expectedCategory }) => allowed.has(expectedCategory))).toBe(true);
  });

  test("matches every case ID prefix to its expected category", () => {
    for (const evaluationCase of cases) {
      const matching = idPrefixesToCategories.filter(([prefix]) =>
        evaluationCase.id.startsWith(prefix),
      );
      expect(matching).toHaveLength(1);
      expect(evaluationCase.expectedCategory).toBe(matching[0][1]);
    }
  });

  test("references only existing reviews and requires evidence only for answerable cases", () => {
    const reviewIds = new Set<string>(persistedReviews.map(({ id }) => id));

    for (const evaluationCase of cases) {
      const cited = evaluationCase.expectedReviewIds;
      expect(new Set(cited).size).toBe(cited.length);
      expect(cited.every((id) => reviewIds.has(id))).toBe(true);

      if (evaluationCase.expectedCategory === "answer_from_active_reviews") {
        expect(cited.length).toBeGreaterThan(0);
      } else {
        expect(cited).toHaveLength(0);
      }
    }
  });

  test.each(requiredExpectedCategories)(
    "includes three distinct cases for %s",
    (expectedCategory) => {
      expect(cases.filter((item) => item.expectedCategory === expectedCategory)).toHaveLength(3);
    },
  );

  test("keeps a compact, balanced fifteen-case baseline", () => {
    expect(cases).toHaveLength(15);
  });
});
