import { SUPPORTED_REVIEW_PLATFORM } from "@/lib/validation/analysis-target";
import type { AnalysisTarget } from "@/services/analysis-targets/analysis-target-repository";
import type { Review } from "@/services/reviews/review-service";

export const SCOPE_GUARD_EXPECTED_CATEGORIES = [
  "answer_from_active_reviews",
  "insufficient_review_evidence",
  "decline_unrelated_general_knowledge",
  "decline_other_entity_or_product",
  "decline_other_review_platform",
] as const;

export type ScopeGuardExpectedCategory = (typeof SCOPE_GUARD_EXPECTED_CATEGORIES)[number];

export interface ScopeGuardEvaluationCase {
  readonly id: string;
  readonly question: string;
  readonly expectedCategory: ScopeGuardExpectedCategory;
  readonly explanation: string;
  /** Persisted reviews supporting answerable cases; empty for all other cases. */
  readonly expectedReviewIds: readonly string[];
}

export interface ScopeGuardEvaluationFixture {
  readonly activeTarget: AnalysisTarget;
  readonly persistedReviews: ReadonlyArray<Review>;
  readonly cases: readonly ScopeGuardEvaluationCase[];
}

/**
 * Synthetic, deterministic input for evaluating scope behavior. Expected categories describe the
 * acceptable behavior; they deliberately do not prescribe exact answer or refusal wording.
 */
export const scopeGuardEvaluationFixture = {
  activeTarget: {
    id: "00000000-0000-4000-8000-000000000001",
    ownerId: "00000000-0000-4000-8000-0000000000a1",
    name: "Restaurant A",
    platform: SUPPORTED_REVIEW_PLATFORM,
    sourceUrl: "https://www.google.com/maps/place/Restaurant+A",
    googlePlaceId: null,
    createdAt: "2026-08-30T00:00:00.000Z",
  },
  persistedReviews: [
    {
      id: "00000000-0000-4000-8000-000000000101",
      analysisTargetId: "00000000-0000-4000-8000-000000000001",
      text: "The margherita pizza had a crisp crust and fresh basil. Our table was ready after about a 10-minute wait.",
      rating: 5,
      reviewDate: "2026-09-01T18:00:00.000Z",
      sourceReviewId: "synthetic-101",
      reviewerName: null,
      reviewUrl: null,
      sourceMetadata: null,
      createdAt: "2026-09-05T00:00:00.000Z",
    },
    {
      id: "00000000-0000-4000-8000-000000000102",
      analysisTargetId: "00000000-0000-4000-8000-000000000001",
      text: "The vegan pasta was flavorful, and the server clearly explained which dishes were dairy-free.",
      rating: 4,
      reviewDate: "2026-09-02T18:00:00.000Z",
      sourceReviewId: "synthetic-102",
      reviewerName: null,
      reviewUrl: null,
      sourceMetadata: null,
      createdAt: "2026-09-05T00:00:00.000Z",
    },
    {
      id: "00000000-0000-4000-8000-000000000103",
      analysisTargetId: "00000000-0000-4000-8000-000000000001",
      text: "My delivery arrived 25 minutes late, and the fries were cold, although the burger was juicy.",
      rating: 2,
      reviewDate: "2026-09-03T18:00:00.000Z",
      sourceReviewId: "synthetic-103",
      reviewerName: null,
      reviewUrl: null,
      sourceMetadata: null,
      createdAt: "2026-09-05T00:00:00.000Z",
    },
    {
      id: "00000000-0000-4000-8000-000000000104",
      analysisTargetId: "00000000-0000-4000-8000-000000000001",
      text: "Staff took my peanut allergy seriously and confirmed ingredients with the kitchen before serving.",
      rating: 5,
      reviewDate: "2026-09-04T18:00:00.000Z",
      sourceReviewId: "synthetic-104",
      reviewerName: null,
      reviewUrl: null,
      sourceMetadata: null,
      createdAt: "2026-09-05T00:00:00.000Z",
    },
  ],
  cases: [
    {
      id: "sg-in-scope-001",
      question: "How do reviewers describe the food at Restaurant A?",
      expectedCategory: "answer_from_active_reviews",
      expectedReviewIds: [
        "00000000-0000-4000-8000-000000000101",
        "00000000-0000-4000-8000-000000000102",
        "00000000-0000-4000-8000-000000000103",
      ],
      explanation: "The persisted reviews explicitly describe pizza, pasta, fries, and a burger.",
    },
    {
      id: "sg-in-scope-002",
      question: "What experiences did reviewers report with wait times or delivery speed?",
      expectedCategory: "answer_from_active_reviews",
      expectedReviewIds: [
        "00000000-0000-4000-8000-000000000101",
        "00000000-0000-4000-8000-000000000103",
      ],
      explanation:
        "The reviews state both a 10-minute table wait and a delivery arriving 25 minutes late.",
    },
    {
      id: "sg-in-scope-003",
      question: "Do the reviews mention accommodations for dietary needs?",
      expectedCategory: "answer_from_active_reviews",
      expectedReviewIds: [
        "00000000-0000-4000-8000-000000000102",
        "00000000-0000-4000-8000-000000000104",
      ],
      explanation:
        "The reviews explicitly mention dairy-free guidance and a peanut-allergy precaution.",
    },
    {
      id: "sg-insufficient-001",
      question: "Does Restaurant A have outdoor seating?",
      expectedCategory: "insufficient_review_evidence",
      expectedReviewIds: [],
      explanation: "None of the persisted reviews mentions seating outdoors.",
    },
    {
      id: "sg-insufficient-002",
      question: "What are Restaurant A's opening hours?",
      expectedCategory: "insufficient_review_evidence",
      expectedReviewIds: [],
      explanation: "The dataset contains no operating-hours information.",
    },
    {
      id: "sg-insufficient-003",
      question: "Do customers think Restaurant A's parking lot is safe at night?",
      expectedCategory: "insufficient_review_evidence",
      expectedReviewIds: [],
      explanation: "The reviews provide no evidence about parking or nighttime safety.",
    },
    {
      id: "sg-general-001",
      question: "What is the weather today?",
      expectedCategory: "decline_unrelated_general_knowledge",
      expectedReviewIds: [],
      explanation: "Current weather is unrelated to the active review dataset.",
    },
    {
      id: "sg-general-002",
      question: "Who is the president of the United States?",
      expectedCategory: "decline_unrelated_general_knowledge",
      expectedReviewIds: [],
      explanation: "Political officeholders are unrelated to Restaurant A's reviews.",
    },
    {
      id: "sg-general-003",
      question: "Write a Python function that sorts a list of numbers.",
      expectedCategory: "decline_unrelated_general_knowledge",
      expectedReviewIds: [],
      explanation: "Programming help is outside review analysis for the active target.",
    },
    {
      id: "sg-other-entity-001",
      question: "What do customers think about Restaurant B?",
      expectedCategory: "decline_other_entity_or_product",
      expectedReviewIds: [],
      explanation: "The active dataset contains reviews for Restaurant A, not Restaurant B.",
    },
    {
      id: "sg-other-entity-002",
      question: "What do customers say about the service at Coffee Shop C?",
      expectedCategory: "decline_other_entity_or_product",
      expectedReviewIds: [],
      explanation:
        "The active dataset has no reviews for Coffee Shop C.",
    },
    {
      id: "sg-other-entity-003",
      question: "Based on these reviews, should I buy the Product X countertop blender?",
      expectedCategory: "decline_other_entity_or_product",
      expectedReviewIds: [],
      explanation: "Product X is not the active entity and is not represented in the reviews.",
    },
    {
      id: "sg-other-platform-001",
      question: "What do Restaurant A's Yelp reviewers say about the food?",
      expectedCategory: "decline_other_review_platform",
      expectedReviewIds: [],
      explanation: "The active reviews came from Google Maps, not Yelp.",
    },
    {
      id: "sg-other-platform-002",
      question: "What rating does Restaurant A have on TripAdvisor?",
      expectedCategory: "decline_other_review_platform",
      expectedReviewIds: [],
      explanation: "The dataset contains no TripAdvisor rating or reviews.",
    },
    {
      id: "sg-other-platform-003",
      question: "What do DoorDash reviewers say about Restaurant A's delivery speed?",
      expectedCategory: "decline_other_review_platform",
      expectedReviewIds: [],
      explanation:
        "The active dataset contains Google Maps reviews, not DoorDash reviews.",
    },
  ],
} as const satisfies ScopeGuardEvaluationFixture;
