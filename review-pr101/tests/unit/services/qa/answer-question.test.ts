/** @jest-environment node */

import { TargetNotFoundError } from "@/services/analysis-targets/target-ownership";
import { answerQuestion, type QaModelCaller } from "@/services/qa/answer-question";
import { readFileSync } from "node:fs";
import path from "node:path";

import { QaModelError, createOpenAiQaModel } from "@/services/qa/openai-qa-client";
import { QaInputValidationError, type QaReviewContext } from "@/services/qa/qa-request";
import { QaResponseError } from "@/services/qa/qa-response";
import {
  QA_MAX_REQUEST_TOKENS,
  QaPromptError,
  type QaModelRequest,
} from "@/services/qa/system-prompt";

jest.mock("server-only", () => ({}));

/*
 * Deterministic fixtures: the "model" here is a fake that returns a fixed reply, so these tests
 * check the pipeline (context → request → call → validation), not live model judgment. Live
 * behavior is measured with the S2-003 harness and the S2-004 evaluation set.
 */

const TARGET_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";

// Controlled dataset: food quality and service only.
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

describe("answerQuestion input validation at the service boundary", () => {
  const validReply = {
    outcome: "answered",
    answer: "Service was slow.",
    citedReviewIds: ["r-service-1"],
  };

  it.each<[string, unknown, string]>([
    ["a non-string question", 12345, "QA_QUESTION_INVALID_TYPE"],
    ["a 140,000-character question", "q".repeat(140_000), "QA_QUESTION_TOO_LONG"],
  ])(
    "rejects %s with QaInputValidationError and never calls callModel",
    async (_label, question, code) => {
      const deps = setup(validReply);

      const promise = answerQuestion(TARGET_ID, question, deps);

      await expect(promise).rejects.toBeInstanceOf(QaInputValidationError);
      await expect(promise).rejects.toMatchObject({ name: "QaInputValidationError", code });
      expect(deps.buildReviewDatasetContext).not.toHaveBeenCalled();
      expect(deps.callModel).not.toHaveBeenCalled();
    },
  );

  it("rejects an oversized serialized request with QaInputValidationError and never calls callModel", async () => {
    const oversized: QaReviewContext = {
      target: context.target,
      reviews: Array.from({ length: 50 }, (_, i) => ({
        id: `r-big-${i}`,
        analysisTargetId: TARGET_ID,
        rating: 3,
        text: "x".repeat(3_000),
        reviewDate: null,
      })),
    };
    const callModel = jest.fn<ReturnType<QaModelCaller>, [QaModelRequest]>();

    await expect(
      answerQuestion(TARGET_ID, "Any complaints?", {
        buildReviewDatasetContext: async () => oversized,
        callModel,
      }),
    ).rejects.toMatchObject({ name: "QaInputValidationError", code: "QA_REQUEST_TOO_LARGE" });
    expect(callModel).not.toHaveBeenCalled();
  });
});

describe("provider gating with the real OpenAI adapter", () => {
  const enabledEnv = {
    QA_ENABLED: "true",
    OPENAI_API_KEY: "test-key",
    OPENAI_QA_MODEL: "gpt-5-mini",
  };
  const completedReply = {
    status: "completed",
    output: [
      {
        type: "message",
        content: [
          {
            type: "output_text",
            text: JSON.stringify({
              outcome: "answered",
              answer: "Service is slow.",
              citedReviewIds: ["r-service-1"],
            }),
          },
        ],
      },
    ],
  };

  let globalFetch: jest.SpiedFunction<typeof fetch>;
  beforeEach(() => {
    // Any accidental real network call fails the test instead of reaching OpenAI.
    globalFetch = jest.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network disabled"));
  });
  afterEach(() => globalFetch.mockRestore());

  function depsWith(env: Record<string, string | undefined>) {
    // Fake OpenAI: the token-count endpoint reports a small request; generation replies.
    const fetcher = jest.fn<Promise<Response>, Parameters<typeof fetch>>(async (url) =>
      String(url).endsWith("/responses/input_tokens")
        ? new Response(JSON.stringify({ object: "response.input_tokens", input_tokens: 900 }))
        : new Response(JSON.stringify(completedReply), { status: 200 }),
    );
    return {
      fetcher,
      deps: {
        buildReviewDatasetContext: jest.fn(async () => context),
        callModel: createOpenAiQaModel({ fetcher, env }),
      },
    };
  }

  it("counts tokens, then generates once, when enabled and configured (control case)", async () => {
    const { fetcher, deps } = depsWith(enabledEnv);

    await expect(answerQuestion(TARGET_ID, "Any complaints?", deps)).resolves.toMatchObject({
      outcome: "answered",
    });
    expect(fetcher.mock.calls.map(([url]) => String(url))).toEqual([
      "https://api.openai.com/v1/responses/input_tokens",
      "https://api.openai.com/v1/responses",
    ]);
  });

  it("never reaches the provider with an oversized question (service boundary checked first)", async () => {
    const { fetcher, deps } = depsWith(enabledEnv);
    const oversized = "Is the food good? ".repeat(QA_MAX_REQUEST_TOKENS);

    await expect(answerQuestion(TARGET_ID, oversized, deps)).rejects.toMatchObject({
      name: "QaInputValidationError",
      code: "QA_QUESTION_TOO_LONG",
    });
    expect(fetcher).not.toHaveBeenCalled();
    expect(globalFetch).not.toHaveBeenCalled();
  });

  it.each([
    ["QA_ENABLED=false", { ...enabledEnv, QA_ENABLED: "false" }],
    ["QA_ENABLED unset", { ...enabledEnv, QA_ENABLED: undefined }],
    ['QA_ENABLED=" true"', { ...enabledEnv, QA_ENABLED: " true" }],
    ['QA_ENABLED="true "', { ...enabledEnv, QA_ENABLED: "true " }],
  ])("never reaches the provider when disabled (%s)", async (_label, env) => {
    const { fetcher, deps } = depsWith(env);

    await expect(answerQuestion(TARGET_ID, "Any complaints?", deps)).rejects.toMatchObject({
      name: "QaModelError",
      code: "QA_DISABLED",
    });
    expect(fetcher).not.toHaveBeenCalled();
    expect(globalFetch).not.toHaveBeenCalled();
  });

  it("ships with Q&A disabled and no model chosen in .env.example", () => {
    const template = readFileSync(path.join(process.cwd(), ".env.example"), "utf8");

    expect(template).toMatch(/^QA_ENABLED=false$/m);
    expect(template).toMatch(/^OPENAI_QA_MODEL=$/m);
    expect(template).toMatch(/^OPENAI_API_KEY=$/m);
  });
});
