import type { QaReviewContext } from "@/services/qa/qa-request";

import {
  claimReply,
  type QaClaimReplyPayload,
  type QaReplyClaim,
} from "../../helpers/qa-harness/grounded-reply";

/**
 * S2-011 adversarial grounding set (PR #104 review, item 1).
 *
 * The validator proves that each quote is a real contiguous span of the review it cites. It does
 * not prove that the quote supports the statement. These deterministic cases measure that gap
 * instead of only describing it: every reply is scripted (no model, no network), and each case
 * records what the validator does with it today and what a semantic check would have to do.
 *
 * Semantic cases: the quote is real, so the deterministic checks pass, but the support is wrong.
 * Control cases: the quote itself is wrong, so the deterministic checks reject the reply.
 */

export const ADVERSARIAL_TARGET_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1";

const REVIEW = {
  food: {
    id: "bbbbbbbb-0000-4000-8000-000000000001",
    text: "The pizza crust was crisp and the sauce tasted fresh.",
  },
  service: {
    id: "bbbbbbbb-0000-4000-8000-000000000002",
    text: "Service was slow and our server forgot the drinks order.",
  },
  parking: {
    id: "bbbbbbbb-0000-4000-8000-000000000003",
    text: "Parking was easy to find, but the lot was poorly lit and felt unsafe at night.",
  },
} as const;

export const ADVERSARIAL_CONTEXT: QaReviewContext = {
  target: { id: ADVERSARIAL_TARGET_ID, name: "Adversarial Pizza", platform: "google_maps" },
  reviews: Object.values(REVIEW).map((review, index) => ({
    id: review.id,
    analysisTargetId: ADVERSARIAL_TARGET_ID,
    rating: [5, 2, 3][index],
    text: review.text,
    reviewDate: null,
  })),
};

export type GroundingCaseKind =
  | "supported"
  | "irrelevant_quote"
  | "partial_support"
  | "contradictory_quote"
  | "control_fabricated_quote"
  | "control_wrong_review"
  | "control_ellipsis_join";

export interface GroundingCase {
  readonly id: string;
  readonly kind: GroundingCaseKind;
  readonly question: string;
  readonly reply: QaClaimReplyPayload;
  /** True when the statement is fully supported by its quotes (the semantic ground truth). */
  readonly semanticallySupported: boolean;
  /** What the deterministic validator does today. */
  readonly validator: "accepts" | "UNSUPPORTED_CLAIM";
}

const claim = (statement: string, ...evidence: [string, string][]): QaReplyClaim => ({
  statement,
  evidence: evidence.map(([reviewId, quote]) => ({ reviewId, quote })),
});

export const GROUNDING_CASES: readonly GroundingCase[] = [
  {
    id: "ground-supported-001",
    kind: "supported",
    question: "What do reviewers say about the pizza?",
    reply: claimReply.answered([
      claim("Reviewers say the crust was crisp.", [REVIEW.food.id, "The pizza crust was crisp"]),
    ]),
    semanticallySupported: true,
    validator: "accepts",
  },
  {
    // A real food sentence offered as evidence for a parking claim.
    id: "ground-irrelevant-001",
    kind: "irrelevant_quote",
    question: "Is the parking lot safe at night?",
    reply: claimReply.answered([
      claim("Reviewers say the parking lot is safe at night.", [
        REVIEW.food.id,
        "the sauce tasted fresh",
      ]),
    ]),
    semanticallySupported: false,
    validator: "accepts",
  },
  {
    // The quote supports half of the statement; "and the staff were friendly" has no support.
    id: "ground-partial-001",
    kind: "partial_support",
    question: "How is the service?",
    reply: claimReply.answered([
      claim("Service was slow, but the staff were friendly and attentive.", [
        REVIEW.service.id,
        "Service was slow",
      ]),
    ]),
    semanticallySupported: false,
    validator: "accepts",
  },
  {
    // The quote is about the right topic and says the opposite of the statement.
    id: "ground-contradictory-001",
    kind: "contradictory_quote",
    question: "Is the parking lot safe at night?",
    reply: claimReply.answered([
      claim("Reviewers say the parking lot feels safe at night.", [
        REVIEW.parking.id,
        "the lot was poorly lit and felt unsafe at night",
      ]),
    ]),
    semanticallySupported: false,
    validator: "accepts",
  },
  {
    id: "ground-control-fabricated-001",
    kind: "control_fabricated_quote",
    question: "Is the parking lot safe at night?",
    reply: claimReply.answered([
      claim("Reviewers say the parking lot is safe at night.", [
        REVIEW.parking.id,
        "the lot felt completely safe at night",
      ]),
    ]),
    semanticallySupported: false,
    validator: "UNSUPPORTED_CLAIM",
  },
  {
    id: "ground-control-wrong-review-001",
    kind: "control_wrong_review",
    question: "How is the service?",
    reply: claimReply.answered([
      claim("Service was slow.", [REVIEW.food.id, "Service was slow and our server"]),
    ]),
    semanticallySupported: false,
    validator: "UNSUPPORTED_CLAIM",
  },
  {
    id: "ground-control-ellipsis-001",
    kind: "control_ellipsis_join",
    question: "Is parking easy and safe?",
    reply: claimReply.answered([
      claim("Parking is easy and safe.", [REVIEW.parking.id, "Parking was easy ... felt safe"]),
    ]),
    semanticallySupported: false,
    validator: "UNSUPPORTED_CLAIM",
  },
];

export const SEMANTIC_MISMATCH_KINDS: readonly GroundingCaseKind[] = [
  "irrelevant_quote",
  "partial_support",
  "contradictory_quote",
];
