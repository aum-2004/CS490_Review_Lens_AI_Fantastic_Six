/** @jest-environment node */

import { validateAnalysisTargetInput } from "@/lib/validation/analysis-target";
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

const isRealTimestamp = (value: string): boolean => {
  if (!timestampPattern.test(value)) return false;

  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  const calendarDay = new Date(Date.UTC(year, month - 1, day));
  const timestamp = new Date(value);

  return (
    !Number.isNaN(timestamp.getTime()) &&
    calendarDay.getUTCFullYear() === year &&
    calendarDay.getUTCMonth() === month - 1 &&
    calendarDay.getUTCDate() === day
  );
};

describe("scope-guard evaluation fixture", () => {
  const { activeTarget, persistedReviews, cases } = scopeGuardEvaluationFixture;

  test("has a synthetic owned Google Maps target and related persisted reviews", () => {
    expect(activeTarget.name).toBe("Restaurant A");
    expect(activeTarget.platform).toBe("google_maps");
    expect(activeTarget.sourceUrl).toBe("https://www.google.com/maps/place/Restaurant+A");
    expect(activeTarget.id).toMatch(uuidPattern);
    expect(activeTarget.ownerId).toMatch(uuidPattern);
    expect(activeTarget.id).not.toBe(activeTarget.ownerId);
    expect(isRealTimestamp(activeTarget.createdAt)).toBe(true);

    expect(
      validateAnalysisTargetInput({
        name: activeTarget.name,
        sourceUrl: activeTarget.sourceUrl,
      }),
    ).toEqual({
      success: true,
      data: {
        name: activeTarget.name,
        sourceUrl: activeTarget.sourceUrl,
        platform: activeTarget.platform,
      },
    });

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
      expect(isRealTimestamp(review.createdAt)).toBe(true);

      const normalized = normalizeReview({
        text: review.text,
        rating: review.rating,
        reviewDate: review.reviewDate,
        sourceReviewId: review.sourceReviewId ?? undefined,
        reviewerName: review.reviewerName ?? undefined,
        reviewUrl: review.reviewUrl ?? undefined,
      });

      expect(normalized.ok).toBe(true);
      if (normalized.ok) {
        expect(normalized.review.reviewDate?.toISOString()).toBe(review.reviewDate);
        expect(normalized.review.text).toBe(review.text);
        expect(normalized.review.rating).toBe(review.rating);
        expect(normalized.review.sourceReviewId ?? null).toBe(review.sourceReviewId);
        expect(normalized.review.reviewUrl ?? null).toBe(review.reviewUrl);
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

  test("references existing reviews and declares required evidence for supported answers", () => {
    const reviewIds = new Set<string>(persistedReviews.map(({ id }) => id));

    for (const evaluationCase of cases) {
      const cited = evaluationCase.expectedReviewIds;
      expect(new Set(cited).size).toBe(cited.length);
      expect(cited.every((id) => reviewIds.has(id))).toBe(true);

      if (evaluationCase.expectedCategory === "answer_from_active_reviews") {
        expect(cited.length).toBeGreaterThan(0);
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
