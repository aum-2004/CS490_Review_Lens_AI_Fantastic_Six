/** @jest-environment node */

import { answerQuestion, type QaModelCaller } from "@/services/qa/answer-question";
import type { QaReviewContext } from "@/services/qa/qa-request";
import { SYSTEM_PROMPT_VERSION, type QaModelRequest } from "@/services/qa/system-prompt";

import { scopeGuardEvaluationFixture as s2004 } from "../../../fixtures/scope-guard-evaluation";

jest.mock("server-only", () => ({}));

/*
 * S2-012: questions in the review-analysis domain that the active dataset cannot answer.
 *
 * Each case uses a controlled dataset where the absence of evidence is KNOWN: a list of topic
 * terms is checked against every review, so the test fails if the dataset ever starts covering
 * the topic. Two datasets are used:
 *   - the issue's own example (food and service reviews; "Is the parking lot safe at night?");
 *   - the team's S2-004 evaluation dataset, with every `insufficient_review_evidence` case.
 *
 * The model is a fake with a fixed reply, so these tests check what the pipeline sends and which
 * replies it accepts. Whether a live model actually chooses `insufficient_evidence` is measured by
 * the S2-004 evaluation, not here.
 */

interface InsufficientCase {
  readonly id: string;
  readonly question: string;
  /** Words that would mean the dataset DOES cover the topic. None may appear in any review. */
  readonly absentTopic: RegExp;
}

interface ControlledDataset {
  readonly name: string;
  readonly context: QaReviewContext;
  readonly cases: readonly InsufficientCase[];
}

// The S2-012 issue example: the reviews discuss food quality and service only.
const ISSUE_TARGET_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const issueExample: ControlledDataset = {
  name: "S2-012 issue example",
  context: {
    target: { id: ISSUE_TARGET_ID, name: "Restaurant A", platform: "google_maps" },
    reviews: [
      {
        id: "r-food-1",
        analysisTargetId: ISSUE_TARGET_ID,
        rating: 5,
        text: "The pizza crust was crisp and the sauce tasted fresh.",
        reviewDate: "2026-09-01T18:00:00.000Z",
      },
      {
        id: "r-service-1",
        analysisTargetId: ISSUE_TARGET_ID,
        rating: 2,
        text: "Service was slow and our server forgot the drinks order.",
        reviewDate: "2026-09-03T19:30:00.000Z",
      },
      {
        id: "r-service-2",
        analysisTargetId: ISSUE_TARGET_ID,
        rating: 1,
        text: "Waited 40 minutes for a table even with a reservation. Staff seemed overwhelmed.",
        reviewDate: null,
      },
    ],
  },
  cases: [
    {
      id: "s2-012-issue-parking",
      question: "Do customers think the parking lot is safe at night?",
      absentTopic: /park|\blot\b|night|safe|security|lighting/i,
    },
  ],
};

/** Topic terms for each S2-004 insufficient case. Every such case must be listed here. */
const S2_004_ABSENT_TOPICS: Readonly<Record<string, RegExp>> = {
  "sg-insufficient-001": /outdoor|outside|patio|terrace|seating/i,
  "sg-insufficient-002": /hours|\bopen|\bclos|morning|evening|weekend/i,
  "sg-insufficient-003": /park|\blot\b|night|safe|security|lighting/i,
};

const s2004InsufficientCases = s2004.cases.filter(
  (testCase) => testCase.expectedCategory === "insufficient_review_evidence",
);

const s2004Dataset: ControlledDataset = {
  name: "S2-004 evaluation dataset",
  context: {
    target: {
      id: s2004.activeTarget.id,
      name: s2004.activeTarget.name,
      platform: s2004.activeTarget.platform,
    },
    // What S2-010 hands over for the active target: only the fields the prompt uses.
    reviews: s2004.persistedReviews.map(({ id, analysisTargetId, rating, text, reviewDate }) => ({
      id,
      analysisTargetId,
      rating,
      text,
      reviewDate,
    })),
  },
  cases: s2004InsufficientCases.map(({ id, question }) => ({
    id,
    question,
    absentTopic: S2_004_ABSENT_TOPICS[id],
  })),
};

const DATASETS = [issueExample, s2004Dataset];

const admitsGap = {
  outcome: "insufficient_evidence",
  answer: "The reviews do not mention this, so I can't tell what customers think about it.",
  citedReviewIds: [],
};

function setup(context: QaReviewContext, reply: unknown) {
  const buildReviewDatasetContext = jest.fn(async () => context);
  const callModel = jest.fn<ReturnType<QaModelCaller>, [QaModelRequest]>(async () => ({
    text: JSON.stringify(reply),
  }));
  return { buildReviewDatasetContext, callModel };
}

describe("S2-012 controlled datasets", () => {
  it("lists topic terms for every S2-004 insufficient_review_evidence case", () => {
    expect(s2004InsufficientCases.map((testCase) => testCase.id)).toEqual(
      Object.keys(S2_004_ABSENT_TOPICS),
    );
    for (const testCase of s2004InsufficientCases) {
      expect(testCase.expectedReviewIds).toEqual([]);
    }
  });

  it.each(
    DATASETS.flatMap((dataset) =>
      dataset.cases.map((testCase) => [testCase.id, dataset, testCase] as const),
    ),
  )(
    "%s: no review in the dataset mentions the topic (absence is known)",
    (_id, dataset, testCase) => {
      expect(dataset.context.reviews.length).toBeGreaterThan(0);
      for (const review of dataset.context.reviews) {
        expect(review.text).not.toMatch(testCase.absentTopic);
      }
    },
  );
});

describe.each(
  DATASETS.flatMap((dataset) =>
    dataset.cases.map((testCase) => [testCase.id, testCase.question, dataset] as const),
  ),
)("answerQuestion for %s (%j)", (_id, question, dataset) => {
  const { context } = dataset;
  const targetId = context.target.id;
  const reviewIds = context.reviews.map((review) => review.id);

  it("sends the whole active dataset and the rules for separating supported from absent", async () => {
    const deps = setup(context, admitsGap);

    await answerQuestion(targetId, question, deps);

    expect(deps.buildReviewDatasetContext).toHaveBeenCalledWith(targetId);
    expect(deps.callModel).toHaveBeenCalledTimes(1);
    const request = deps.callModel.mock.calls[0][0];
    expect(request.reviewIds).toEqual(reviewIds);
    expect(request.input).toContain(JSON.stringify(question));
    // Evidence rule 4: say clearly when the reviews lack the information; do not fill the gap.
    expect(request.instructions).toMatch(
      /do not contain enough information to\s+answer it, say so clearly\. Do not guess or fill the gap\s+from general knowledge/,
    );
    // Evidence rule 5: keep what the reviews say separate from what they do not say.
    expect(request.instructions).toMatch(
      /Keep what the reviews say separate from what they do not say/,
    );
    expect(request.instructions).toMatch(
      /"insufficient_evidence": the question is about these reviews, but they lack the needed evidence/,
    );
  });

  it("returns an insufficient_evidence reply that states the limitation, with no citations", async () => {
    await expect(answerQuestion(targetId, question, setup(context, admitsGap))).resolves.toEqual({
      ...admitsGap,
      promptVersion: SYSTEM_PROMPT_VERSION,
      targetId,
    });
  });

  it("rejects a guessed 'answered' reply with no supporting reviews", async () => {
    const guess = { outcome: "answered", answer: "Yes, customers think so.", citedReviewIds: [] };
    await expect(answerQuestion(targetId, question, setup(context, guess))).rejects.toMatchObject({
      name: "QaResponseError",
      code: "UNGROUNDED_ANSWER",
    });
  });

  it("rejects an 'answered' reply that cites a review outside the dataset", async () => {
    const invented = {
      outcome: "answered",
      answer: "One reviewer confirmed it.",
      citedReviewIds: ["00000000-0000-4000-8000-000000000999"],
    };
    await expect(
      answerQuestion(targetId, question, setup(context, invented)),
    ).rejects.toMatchObject({ code: "UNGROUNDED_ANSWER" });
  });

  it("rejects an insufficient_evidence reply that cites reviews (contradictory)", async () => {
    const contradictory = { ...admitsGap, citedReviewIds: [reviewIds[0]] };
    await expect(
      answerQuestion(targetId, question, setup(context, contradictory)),
    ).rejects.toMatchObject({ code: "UNEXPECTED_CITATIONS" });
  });
});

describe("S2-012 partial evidence", () => {
  // The pizza half is covered by the first S2-004 review; the outdoor-seating half is not.
  const { context } = s2004Dataset;
  const targetId = context.target.id;
  const pizzaReviewId = context.reviews[0].id;
  const question = "How is the pizza, and does Restaurant A have outdoor seating?";

  it("uses a review that covers the pizza and none that covers seating", () => {
    expect(context.reviews[0].text).toMatch(/pizza/i);
    for (const review of context.reviews) {
      expect(review.text).not.toMatch(S2_004_ABSENT_TOPICS["sg-insufficient-001"]);
    }
  });

  it("accepts 'answered' for the supported part when it cites support and names the gap", async () => {
    const partial = {
      outcome: "answered",
      answer:
        "One reviewer praised the margherita pizza's crisp crust. The reviews do not mention outdoor seating.",
      citedReviewIds: [pizzaReviewId],
    };

    await expect(answerQuestion(targetId, question, setup(context, partial))).resolves.toEqual({
      ...partial,
      promptVersion: SYSTEM_PROMPT_VERSION,
      targetId,
    });
  });

  it("tells the model to answer the supported part and state what is not covered", async () => {
    const deps = setup(context, admitsGap);
    await answerQuestion(targetId, question, deps);
    expect(deps.callModel.mock.calls[0][0].instructions).toMatch(
      /If the reviews\s+answer part of the question, use "answered" for that part, cite the reviews that support it,\s+and state what the reviews do not cover/,
    );
  });
});
