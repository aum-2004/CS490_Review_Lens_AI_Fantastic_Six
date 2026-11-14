/** @jest-environment node */

import { answerQuestion, type QaModelCaller } from "@/services/qa/answer-question";
import type { QaReviewContext } from "@/services/qa/qa-request";
import { SYSTEM_PROMPT_VERSION, type QaModelRequest } from "@/services/qa/system-prompt";

import { scopeGuardEvaluationFixture as fixture } from "../../../fixtures/scope-guard-evaluation";

jest.mock("server-only", () => ({}));

/*
 * S2-012: questions in the review-analysis domain that the active dataset cannot answer.
 *
 * Uses the team's S2-004 controlled dataset (Restaurant A: food, wait times, dietary needs) and
 * every case it labels `insufficient_review_evidence`. The model is a fake with a fixed reply, so
 * these tests check that the pipeline sends the full dataset with the "distinguish supported from
 * absent" rules and accepts only replies that admit the gap. Whether a live model actually picks
 * `insufficient_evidence` is measured by the S2-004 evaluation, not here.
 */

const target = fixture.activeTarget;

// What S2-010 would hand over for the active target: only the fields the prompt uses.
const context: QaReviewContext = {
  target: { id: target.id, name: target.name, platform: target.platform },
  reviews: fixture.persistedReviews.map(({ id, analysisTargetId, rating, text, reviewDate }) => ({
    id,
    analysisTargetId,
    rating,
    text,
    reviewDate,
  })),
};

const reviewIds = fixture.persistedReviews.map((review) => review.id);

const insufficientCases = fixture.cases.filter(
  (testCase) => testCase.expectedCategory === "insufficient_review_evidence",
);

/**
 * Words that would indicate the dataset DOES cover each case's topic. Every insufficient case must
 * be listed, so a new S2-004 case cannot skip the "absence is known" check.
 */
const ABSENT_TOPIC_TERMS: Record<string, RegExp> = {
  "sg-insufficient-001": /outdoor|outside|patio|terrace|seating/i,
  "sg-insufficient-002": /hours|open|clos|morning|evening|weekend/i,
  "sg-insufficient-003": /park|lot\b|night|safe|security|lighting/i,
};

function setup(reply: unknown) {
  const buildReviewDatasetContext = jest.fn(async () => context);
  const callModel = jest.fn<ReturnType<QaModelCaller>, [QaModelRequest]>(async () => ({
    text: JSON.stringify(reply),
  }));
  return { buildReviewDatasetContext, callModel };
}

const admitsGap = {
  outcome: "insufficient_evidence",
  answer: "The reviews cover food, wait times, and dietary needs, but not this topic.",
  citedReviewIds: [],
};

describe("S2-012 controlled dataset (S2-004 insufficient_review_evidence cases)", () => {
  it("contains at least the three insufficient-evidence cases, each with no expected reviews", () => {
    expect(insufficientCases.length).toBeGreaterThanOrEqual(3);
    for (const testCase of insufficientCases) {
      expect(testCase.expectedReviewIds).toEqual([]);
      expect(ABSENT_TOPIC_TERMS).toHaveProperty([testCase.id]);
    }
  });

  it.each(insufficientCases.map((testCase) => [testCase.id, testCase.question]))(
    "%s: no persisted review mentions the topic (absence is known)",
    (id) => {
      for (const review of fixture.persistedReviews) {
        expect(review.text).not.toMatch(ABSENT_TOPIC_TERMS[id]);
      }
    },
  );
});

describe.each(insufficientCases.map((testCase) => [testCase.id, testCase.question]))(
  "answerQuestion for %s (%j)",
  (_id, question) => {
    it("sends the whole active dataset with the supported-vs-absent rules", async () => {
      const deps = setup(admitsGap);

      await answerQuestion(target.id, question, deps);

      expect(deps.buildReviewDatasetContext).toHaveBeenCalledWith(target.id);
      expect(deps.callModel).toHaveBeenCalledTimes(1);
      const request = deps.callModel.mock.calls[0][0];
      expect(request.reviewIds).toEqual(reviewIds);
      expect(request.input).toContain(question);
      // Rule 4: say clearly when the reviews lack the information; do not fill the gap.
      expect(request.instructions).toMatch(
        /do not contain enough information to\s+answer it, say so clearly\. Do not guess or fill the gap\s+from general knowledge/,
      );
      // Rule 5: keep what the reviews say separate from what they do not say.
      expect(request.instructions).toMatch(
        /Keep what the reviews say separate from what they do not say/,
      );
      expect(request.instructions).toMatch(/"insufficient_evidence": the question is about/);
    });

    it("returns an insufficient_evidence reply with no citations", async () => {
      await expect(answerQuestion(target.id, question, setup(admitsGap))).resolves.toEqual({
        ...admitsGap,
        promptVersion: SYSTEM_PROMPT_VERSION,
        targetId: target.id,
      });
    });

    it("rejects a guessed 'answered' reply with no citations", async () => {
      const guess = { outcome: "answered", answer: "Yes, definitely.", citedReviewIds: [] };
      await expect(answerQuestion(target.id, question, setup(guess))).rejects.toMatchObject({
        name: "QaResponseError",
        code: "UNGROUNDED_ANSWER",
      });
    });

    it("rejects an 'answered' reply that cites a review not in the dataset", async () => {
      const invented = {
        outcome: "answered",
        answer: "One reviewer confirmed it.",
        citedReviewIds: ["00000000-0000-4000-8000-000000000999"],
      };
      await expect(answerQuestion(target.id, question, setup(invented))).rejects.toMatchObject({
        code: "UNGROUNDED_ANSWER",
      });
    });

    it("rejects an insufficient_evidence reply that cites reviews (contradictory)", async () => {
      const contradictory = { ...admitsGap, citedReviewIds: [reviewIds[0]] };
      await expect(answerQuestion(target.id, question, setup(contradictory))).rejects.toMatchObject(
        { code: "UNEXPECTED_CITATIONS" },
      );
    });
  },
);

describe("S2-012 partial evidence", () => {
  // The food half is covered by review 101; the outdoor-seating half is not covered at all.
  const question = "How is the pizza, and does Restaurant A have outdoor seating?";

  it("accepts 'answered' for the supported part when it cites support and names the gap", async () => {
    const partial = {
      outcome: "answered",
      answer:
        "One reviewer praised the margherita pizza's crisp crust. The reviews do not mention outdoor seating.",
      citedReviewIds: [reviewIds[0]],
    };

    await expect(answerQuestion(target.id, question, setup(partial))).resolves.toMatchObject({
      outcome: "answered",
      citedReviewIds: [reviewIds[0]],
    });
  });

  it("tells the model how to answer partially", async () => {
    const deps = setup(admitsGap);
    await answerQuestion(target.id, question, deps);
    expect(deps.callModel.mock.calls[0][0].instructions).toMatch(
      /If the reviews\s+answer part of the question, use "answered" for that part, cite the reviews that support it,\s+and state what the reviews do not cover/,
    );
  });
});
