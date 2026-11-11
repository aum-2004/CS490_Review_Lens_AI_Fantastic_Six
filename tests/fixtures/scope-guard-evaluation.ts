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
}

interface ScopeGuardEvaluationFixture {
  readonly activeTarget: {
    readonly id: string;
    readonly name: string;
    readonly platform: "google_maps";
    readonly sourceUrl: string;
  };
  readonly persistedReviews: ReadonlyArray<{
    readonly id: string;
    readonly analysisTargetId: string;
    readonly text: string;
    readonly rating: number;
    readonly reviewDate: string;
  }>;
  readonly cases: readonly ScopeGuardEvaluationCase[];
}

/**
 * Synthetic, deterministic input for evaluating scope behavior. Expected categories describe the
 * acceptable behavior; they deliberately do not prescribe exact answer or refusal wording.
 */
export const scopeGuardEvaluationFixture = {
  activeTarget: {
    id: "00000000-0000-4000-8000-000000000001",
    name: "Restaurant A",
    platform: "google_maps",
    sourceUrl: "https://www.google.com/maps/place/Restaurant+A",
  },
  persistedReviews: [
    {
      id: "00000000-0000-4000-8000-000000000101",
      analysisTargetId: "00000000-0000-4000-8000-000000000001",
      text: "The margherita pizza had a crisp crust and fresh basil. Our table was ready after about a 10-minute wait.",
      rating: 5,
      reviewDate: "2026-09-01T18:00:00.000Z",
    },
    {
      id: "00000000-0000-4000-8000-000000000102",
      analysisTargetId: "00000000-0000-4000-8000-000000000001",
      text: "The vegan pasta was flavorful, and the server clearly explained which dishes were dairy-free.",
      rating: 4,
      reviewDate: "2026-09-02T18:00:00.000Z",
    },
    {
      id: "00000000-0000-4000-8000-000000000103",
      analysisTargetId: "00000000-0000-4000-8000-000000000001",
      text: "My delivery arrived 25 minutes late, and the fries were cold, although the burger was juicy.",
      rating: 2,
      reviewDate: "2026-09-03T18:00:00.000Z",
    },
    {
      id: "00000000-0000-4000-8000-000000000104",
      analysisTargetId: "00000000-0000-4000-8000-000000000001",
      text: "Staff took my peanut allergy seriously and confirmed ingredients with the kitchen before serving.",
      rating: 5,
      reviewDate: "2026-09-04T18:00:00.000Z",
    },
  ],
  cases: [
    {
      id: "sg-in-scope-001",
      question: "How do reviewers describe the food at Restaurant A?",
      expectedCategory: "answer_from_active_reviews",
      explanation: "The persisted reviews explicitly describe pizza, pasta, fries, and a burger.",
    },
    {
      id: "sg-in-scope-002",
      question: "What experiences did reviewers report with wait times or delivery speed?",
      expectedCategory: "answer_from_active_reviews",
      explanation:
        "The reviews state both a 10-minute table wait and a delivery arriving 25 minutes late.",
    },
    {
      id: "sg-in-scope-003",
      question: "Do the reviews mention accommodations for dietary needs?",
      expectedCategory: "answer_from_active_reviews",
      explanation:
        "The reviews explicitly mention dairy-free guidance and a peanut-allergy precaution.",
    },
    {
      id: "sg-insufficient-001",
      question: "Does Restaurant A have outdoor seating?",
      expectedCategory: "insufficient_review_evidence",
      explanation: "None of the persisted reviews mentions seating outdoors.",
    },
    {
      id: "sg-insufficient-002",
      question: "What are Restaurant A's opening hours?",
      expectedCategory: "insufficient_review_evidence",
      explanation: "The dataset contains no operating-hours information.",
    },
    {
      id: "sg-insufficient-003",
      question: "Do customers think Restaurant A's parking lot is safe at night?",
      expectedCategory: "insufficient_review_evidence",
      explanation: "The reviews provide no evidence about parking or nighttime safety.",
    },
    {
      id: "sg-general-001",
      question: "What is the weather today?",
      expectedCategory: "decline_unrelated_general_knowledge",
      explanation: "Current weather is unrelated to the active review dataset.",
    },
    {
      id: "sg-general-002",
      question: "Who is the president of the United States?",
      expectedCategory: "decline_unrelated_general_knowledge",
      explanation: "Political officeholders are unrelated to Restaurant A's reviews.",
    },
    {
      id: "sg-general-003",
      question: "Write a Python function that sorts a list of numbers.",
      expectedCategory: "decline_unrelated_general_knowledge",
      explanation: "Programming help is outside review analysis for the active target.",
    },
    {
      id: "sg-other-entity-001",
      question: "What do customers think about Restaurant B?",
      expectedCategory: "decline_other_entity_or_product",
      explanation: "The active dataset contains reviews for Restaurant A, not Restaurant B.",
    },
    {
      id: "sg-other-entity-002",
      question: "Is Coffee Shop C's service better than Restaurant A's service?",
      expectedCategory: "decline_other_entity_or_product",
      explanation:
        "The dataset has no reviews for Coffee Shop C, so it cannot support a comparison.",
    },
    {
      id: "sg-other-entity-003",
      question: "Based on these reviews, should I buy the Product X countertop blender?",
      expectedCategory: "decline_other_entity_or_product",
      explanation: "Product X is not the active entity and is not represented in the reviews.",
    },
    {
      id: "sg-other-platform-001",
      question: "What do Restaurant A's Yelp reviewers say about the food?",
      expectedCategory: "decline_other_review_platform",
      explanation: "The active reviews came from Google Maps, not Yelp.",
    },
    {
      id: "sg-other-platform-002",
      question: "What rating does Restaurant A have on TripAdvisor?",
      expectedCategory: "decline_other_review_platform",
      explanation: "The dataset contains no TripAdvisor rating or reviews.",
    },
    {
      id: "sg-other-platform-003",
      question: "Do DoorDash reviews agree with these Google Maps reviews about delivery?",
      expectedCategory: "decline_other_review_platform",
      explanation:
        "A cross-platform comparison needs DoorDash evidence that is absent from the dataset.",
    },
  ],
} as const satisfies ScopeGuardEvaluationFixture;
