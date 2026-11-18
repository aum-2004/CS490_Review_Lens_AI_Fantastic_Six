/** @jest-environment node */

import { answerQuestion, type QaModelCaller } from "@/services/qa/answer-question";
import type { QaReviewContext } from "@/services/qa/qa-request";
import { SYSTEM_PROMPT_VERSION, type QaModelRequest } from "@/services/qa/system-prompt";

import { scopeGuardEvaluationFixture as s2004 } from "../../../fixtures/scope-guard-evaluation";
import {
  claimFrom,
  claimReply,
  evidenceFrom,
  quoteOf,
} from "../../../helpers/qa-harness/grounded-reply";

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
  /**
   * Keywords for the topic. The question must match them (so they describe what is asked), and no
   * review may match them (so the dataset does not cover the topic). This is a keyword check on a
   * fixed fixture, not a semantic one: a review that discusses the topic in other words would pass.
   */
  readonly absentTopic: RegExp;
}

/** Parking safety at night: the lot itself, vehicles, and the conditions that make it unsafe. */
const PARKING_SAFETY_TERMS =
  /park|\blot\b|night|safe|security|lighting|\bcars?\b|garage|valet|\bdark/i;

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
      absentTopic: PARKING_SAFETY_TERMS,
    },
  ],
};

/** Topic terms for each S2-004 insufficient case. Every such case must be listed here. */
const S2_004_ABSENT_TOPICS: Readonly<Record<string, RegExp>> = {
  "sg-insufficient-001": /outdoor|outside|patio|terrace|seating/i,
  "sg-insufficient-002": /hours|\bopen|\bclos|morning|evening|weekend/i,
  "sg-insufficient-003": PARKING_SAFETY_TERMS,
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

/** Server-owned wording since s2-013.v7; the model writes no explanation. Asserted literally. */
const ADMITS_GAP_ANSWER = "These reviews don't contain enough information to answer that question.";

/** The fake model's reply. Tests assert the expected outcome literally, never via this object. */
const admitsGap = claimReply.insufficientEvidence();

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

  const allCases = DATASETS.flatMap((dataset) =>
    dataset.cases.map((testCase) => [testCase.id, dataset, testCase] as const),
  );

  it.each(allCases)(
    "%s: the question matches its declared topic keywords",
    (_id, _ds, testCase) => {
      expect(testCase.question).toMatch(testCase.absentTopic);
    },
  );

  it.each(allCases)(
    "%s: no review in the dataset matches the topic keywords (absence is known)",
    (_id, dataset, testCase) => {
      expect(dataset.context.reviews.length).toBeGreaterThan(0);
      for (const review of dataset.context.reviews) {
        expect(review.text).not.toMatch(testCase.absentTopic);
      }
    },
  );

  it("catches parking evidence that avoids the words 'parking' and 'lot'", () => {
    const disguised = "We left the car in the garage; the valet stand was dark and empty.";
    expect(disguised).toMatch(PARKING_SAFETY_TERMS);
  });
});

/** The dataset section of the outgoing request, parsed back into the reviews the model sees. */
function sentDataset(request: QaModelRequest): unknown {
  const datasetStart = request.input.indexOf("REVIEW DATASET (");
  const questionStart = request.input.indexOf("\n\nQUESTION (JSON string):\n");
  if (datasetStart === -1 || questionStart === -1) {
    throw new Error("Request input does not have the expected sections.");
  }
  const match = /^REVIEW DATASET \((\d+) reviews, JSON array\):\n([\s\S]*)$/.exec(
    request.input.slice(datasetStart, questionStart),
  );
  if (!match) throw new Error("Request input does not have the expected sections.");
  const reviews: unknown = JSON.parse(match[2]);
  expect(Array.isArray(reviews) && reviews.length).toBe(Number(match[1]));
  return reviews;
}

function sentQuestion(request: QaModelRequest): unknown {
  return JSON.parse(request.input.slice(request.input.lastIndexOf("\n") + 1));
}

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
    expect(request.targetId).toBe(targetId);
    expect(request.reviewIds).toEqual(reviewIds);
    // Every review reaches the model with all of its projected fields, unchanged and in order.
    // Built from the controlled dataset, not from the request, so blanking or dropping any field
    // in the pipeline fails here.
    expect(sentDataset(request)).toEqual(
      context.reviews.map((review) => ({
        id: review.id,
        rating: review.rating,
        date: review.reviewDate,
        text: review.text,
      })),
    );
    for (const review of context.reviews) {
      expect(review.text.trim().length).toBeGreaterThan(0);
    }
    expect(sentQuestion(request)).toBe(question);
    // Evidence rule 4: report insufficient_evidence when the reviews lack it; do not fill the gap.
    expect(request.instructions).toMatch(
      /do not contain enough information to\s+answer it, use "insufficient_evidence"\. Do not guess or fill the gap\s+from general knowledge/,
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
    const result = await answerQuestion(targetId, question, setup(context, admitsGap));

    // Literal expectations, independent of the fake reply object: if the fixture drifted to a
    // decline (or anything else), this would fail instead of echoing it back.
    expect(result).toEqual({
      outcome: "insufficient_evidence",
      answer: ADMITS_GAP_ANSWER,
      citedReviewIds: [],
      promptVersion: SYSTEM_PROMPT_VERSION,
      targetId,
    });
  });

  it("rejects a guessed 'answered' reply with no supporting reviews", async () => {
    const guess = claimReply.answered([]);
    await expect(answerQuestion(targetId, question, setup(context, guess))).rejects.toMatchObject({
      name: "QaResponseError",
      code: "UNGROUNDED_ANSWER",
    });
  });

  it("rejects an 'answered' reply that cites a review outside the dataset", async () => {
    const invented = claimReply.answered([
      claimFrom("One reviewer confirmed it.", {
        id: "00000000-0000-4000-8000-000000000999",
        text: "One reviewer confirmed it.",
      }),
    ]);
    await expect(
      answerQuestion(targetId, question, setup(context, invented)),
    ).rejects.toMatchObject({ code: "UNGROUNDED_ANSWER" });
  });

  it("rejects an 'answered' reply whose real citation does not contain its quote", async () => {
    // A valid citation is not proof: the cited review exists but never discusses this topic.
    const unsupported = claimReply.answered([
      {
        statement: "One reviewer confirmed it.",
        evidence: [evidenceFrom(context.reviews[0], `Yes: ${question}`)],
      },
    ]);
    await expect(
      answerQuestion(targetId, question, setup(context, unsupported)),
    ).rejects.toMatchObject({ code: "UNSUPPORTED_CLAIM" });
  });

  it("rejects an insufficient_evidence reply that cites reviews (contradictory)", async () => {
    const contradictory = claimReply.insufficientEvidence([
      claimFrom("Contradiction.", context.reviews[0]),
    ]);
    await expect(
      answerQuestion(targetId, question, setup(context, contradictory)),
    ).rejects.toMatchObject({ code: "UNEXPECTED_CITATIONS" });
  });

  // PR #104 review, item 2: the insufficient-evidence answer used to be the model's free-text
  // note, which could carry an unsupported finding. It is now impossible: there is no such field.
  it.each([
    ["an unsupported finding", "Customers think the parking lot is safe at night."],
    ["echoed prompt text", "You are ReviewLens, an assistant that analyzes one set of reviews."],
  ])(
    "rejects an insufficient_evidence reply that tries to carry %s in a note",
    async (_l, note) => {
      const smuggled = { ...claimReply.insufficientEvidence(), note };
      await expect(
        answerQuestion(targetId, question, setup(context, smuggled)),
      ).rejects.toMatchObject({ name: "QaResponseError", code: "INVALID_MODEL_RESPONSE" });
    },
  );
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

  it("accepts 'answered' for the supported part when it quotes support and marks partial coverage", async () => {
    const partial = claimReply.answered(
      [claimFrom("One reviewer praised the margherita pizza's crisp crust.", context.reviews[0])],
      "partial",
    );

    await expect(answerQuestion(targetId, question, setup(context, partial))).resolves.toEqual({
      outcome: "answered",
      // Supported findings with their quotes first, then fixed server text for the gap (S2-012).
      answer: `One reviewer praised the margherita pizza's crisp crust.\n  "${quoteOf(context.reviews[0].text)}" [${pizzaReviewId}]\n\nParts of your question are not covered by these reviews.`,
      citedReviewIds: [pizzaReviewId],
      promptVersion: SYSTEM_PROMPT_VERSION,
      targetId,
    });
  });

  it("rejects a partial answer that tries to state the gap (or a finding) in a note", async () => {
    const partial = claimReply.answered(
      [claimFrom("One reviewer praised the margherita pizza's crisp crust.", context.reviews[0])],
      "partial",
    );
    const smuggled = { ...partial, note: "Outdoor seating is available and heated." };
    await expect(
      answerQuestion(targetId, question, setup(context, smuggled)),
    ).rejects.toMatchObject({ name: "QaResponseError", code: "INVALID_MODEL_RESPONSE" });
  });

  it("tells the model to answer the supported part and mark the coverage as partial", async () => {
    const deps = setup(context, admitsGap);
    await answerQuestion(targetId, question, deps);
    expect(deps.callModel.mock.calls[0][0].instructions).toMatch(
      /If\s+the reviews answer part of the question, use "answered" for that part, give a claim for each\s+supported finding, and set "coverage" to "partial"/,
    );
  });
});
