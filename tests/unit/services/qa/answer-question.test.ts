/** @jest-environment node */

import { TargetNotFoundError } from "@/services/analysis-targets/target-ownership";
import { answerQuestion, type QaModelCaller } from "@/services/qa/answer-question";
import { QaModelError } from "@/services/qa/openai-qa-client";
import type { QaReviewContext } from "@/services/qa/qa-request";
import { QaResponseError } from "@/services/qa/qa-response";
import { QaPromptError, type QaModelRequest } from "@/services/qa/system-prompt";

jest.mock("server-only", () => ({}));

/*
 * Deterministic fixtures: the "model" here is a fake that returns a fixed reply, so these tests
 * check the pipeline (context → request → call → validation), not live model judgment. Live
 * behavior is measured with the S2-003 harness and the S2-004 evaluation set.
 */

const TARGET_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";

// Controlled dataset for S2-012: food quality and service only. Nothing about parking.
const context: QaReviewContext = {
  target: { id: TARGET_ID, name: "Restaurant A", platform: "google_maps" },
  reviews: [
    {
      id: "r-food-1",
      analysisTargetId: TARGET_ID,
      rating: 5,
      text: "The pizza crust was crisp and the sauce tasted fresh.",
      reviewDate: "2026-09-01T18:00:00.000Z",
    },
    {
      id: "r-service-1",
      analysisTargetId: TARGET_ID,
      rating: 2,
      text: "Service was slow and our server forgot the drinks order.",
      reviewDate: "2026-09-03T19:30:00.000Z",
    },
    {
      id: "r-service-2",
      analysisTargetId: TARGET_ID,
      rating: 1,
      text: "Waited 40 minutes for a table even with a reservation. Staff seemed overwhelmed.",
      reviewDate: null,
    },
  ],
};

function setup(modelReply: unknown | Error) {
  const buildReviewDatasetContext = jest.fn(async () => context);
  const callModel = jest.fn<ReturnType<QaModelCaller>, [QaModelRequest]>(async () => {
    if (modelReply instanceof Error) throw modelReply;
    return { text: typeof modelReply === "string" ? modelReply : JSON.stringify(modelReply) };
  });
  return { buildReviewDatasetContext, callModel };
}

describe("answerQuestion (S2-011)", () => {
  it.each([
    "What complaints appear most frequently?",
    "Are there recurring complaints about customer service?",
    "What themes appear in low-rated reviews?",
  ])("returns a validated, cited answer for %j", async (question) => {
    const deps = setup({
      outcome: "answered",
      answer: "The most common complaint is slow service and long waits.",
      citedReviewIds: ["r-service-1", "r-service-2"],
    });

    const answer = await answerQuestion(TARGET_ID, question, deps);

    expect(answer).toEqual({
      outcome: "answered",
      answer: "The most common complaint is slow service and long waits.",
      citedReviewIds: ["r-service-1", "r-service-2"],
      promptVersion: expect.stringMatching(/^s2-013\./),
      targetId: TARGET_ID,
    });
    expect(deps.buildReviewDatasetContext).toHaveBeenCalledWith(TARGET_ID);
    const sent = deps.callModel.mock.calls[0][0];
    expect(sent.reviewIds).toEqual(["r-food-1", "r-service-1", "r-service-2"]);
    expect(sent.input).toContain(JSON.stringify(question));
  });

  it("rejects an answer that cites a review outside the active dataset", async () => {
    const deps = setup({
      outcome: "answered",
      answer: "Customers love the patio.",
      citedReviewIds: ["r-from-restaurant-b"],
    });

    await expect(answerQuestion(TARGET_ID, "What do customers like?", deps)).rejects.toMatchObject({
      name: "QaResponseError",
      code: "UNGROUNDED_ANSWER",
    });
  });

  it("rejects a malformed model reply instead of showing it", async () => {
    const deps = setup("Customers like the pizza!");

    await expect(answerQuestion(TARGET_ID, "What do customers like?", deps)).rejects.toBeInstanceOf(
      QaResponseError,
    );
  });

  it("does not call the model when the context cannot be built", async () => {
    const deps = setup({ outcome: "answered", answer: "x", citedReviewIds: ["r-food-1"] });
    deps.buildReviewDatasetContext.mockRejectedValue(new TargetNotFoundError());

    await expect(answerQuestion(TARGET_ID, "Any complaints?", deps)).rejects.toBeInstanceOf(
      TargetNotFoundError,
    );
    expect(deps.callModel).not.toHaveBeenCalled();
  });

  it("does not call the model for an invalid question", async () => {
    const deps = setup({ outcome: "answered", answer: "x", citedReviewIds: ["r-food-1"] });

    await expect(answerQuestion(TARGET_ID, "  ", deps)).rejects.toBeInstanceOf(QaPromptError);
    expect(deps.callModel).not.toHaveBeenCalled();
  });

  it("passes provider errors through unchanged", async () => {
    const failure = new QaModelError("MODEL_RATE_LIMITED");

    await expect(answerQuestion(TARGET_ID, "Any complaints?", setup(failure))).rejects.toBe(
      failure,
    );
  });
});

describe("answerQuestion with insufficient evidence (S2-012)", () => {
  const PARKING_QUESTION = "Do customers think the parking lot is safe at night?";

  it("sends a dataset in which the absence of parking evidence is known", async () => {
    const deps = setup({
      outcome: "insufficient_evidence",
      answer: "The reviews discuss food and service but do not mention parking.",
      citedReviewIds: [],
    });

    await answerQuestion(TARGET_ID, PARKING_QUESTION, deps);

    const sent = deps.callModel.mock.calls[0][0];
    const dataset = sent.input.split("\n")[1];
    expect(dataset).not.toMatch(/park|lot|night|safe/i);
    expect(sent.instructions).toMatch(/do not contain enough information to\s+answer it/i);
  });

  it("returns an insufficient_evidence reply that states the limitation", async () => {
    const answer = await answerQuestion(
      TARGET_ID,
      PARKING_QUESTION,
      setup({
        outcome: "insufficient_evidence",
        answer: "The reviews discuss food and service but do not mention parking.",
        citedReviewIds: [],
      }),
    );

    expect(answer).toMatchObject({ outcome: "insufficient_evidence", citedReviewIds: [] });
    expect(answer.answer).toMatch(/do not mention parking/);
  });

  it("rejects an 'answered' reply with no supporting reviews (a general-knowledge guess)", async () => {
    const deps = setup({
      outcome: "answered",
      answer: "Yes, the lot is well lit and safe at night.",
      citedReviewIds: [],
    });

    await expect(answerQuestion(TARGET_ID, PARKING_QUESTION, deps)).rejects.toMatchObject({
      code: "UNGROUNDED_ANSWER",
    });
  });
});
