/** @jest-environment node */

// S2-003 harness preamble: the real Q&A pipeline imports `server-only` modules, and the fake
// Supabase is injected through this module mock (the context builder has no client seam).
jest.mock("server-only", () => ({}));
jest.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: jest.fn() }));

import { createOpenAiQaModel } from "@/services/qa/openai-qa-client";
import { QA_REPLY_JSON_SCHEMA } from "@/services/qa/qa-response";
import { buildSystemPrompt, REVIEW_PLATFORM_LABELS } from "@/services/qa/system-prompt";

import { allQaDatasets, getQaDataset, type QaFixtureDataset } from "../../fixtures/qa/datasets";
import {
  claimFrom,
  claimReply,
  createFakeOpenAiFetch,
  evidenceFrom,
  expectContextOnlyForTarget,
  expectErrorShape,
  expectNoForeignData,
  expectNoReviewerIdentity,
  FAKE_OPENAI_COUNT_URL,
  FAKE_OPENAI_ENV,
  FAKE_OPENAI_RESPONSES_URL,
  openAi,
  QA_PIPELINE_ERRORS,
  QA_RESERVED_OUTPUT_TOKENS,
  QA_MAX_REQUEST_TOKENS,
  realQaPipeline,
  setupQaTestHarness,
  SYSTEM_PROMPT_VERSION,
  type FakeOpenAiCall,
  type FakeOpenAiFetch,
  type FakeOpenAiFetchOptions,
  type QaAskResult,
  type QaModelRequest,
  type QaPipelineErrorKey,
} from "../../helpers/qa-harness";

/**
 * S2-003 provider boundary: the real `answerQuestion` → real S2-010 builder (fake Supabase) →
 * real `createOpenAiQaModel` with a fake `fetcher` and a synthetic env. Checks the exact body
 * sent to OpenAI and how every kind of provider reply is handled. The network guard is installed
 * throughout, OPENAI_API_KEY is scrubbed from process.env, and no real request is possible.
 */

const targetA = getQaDataset("targetA");
const targetB = getQaDataset("targetB");
const QUESTION = "What do reviewers say about battery life?";

let provider: FakeOpenAiFetch;

/** The harness fake model is bypassed; the real OpenAI adapter becomes `callModel`. */
function withProvider(options: FakeOpenAiFetchOptions = {}, env = FAKE_OPENAI_ENV) {
  provider = createFakeOpenAiFetch(options);
  const callModel = createOpenAiQaModel({ fetcher: provider.fetcher, env });
  return callModel;
}

let callModel = withProvider();
const qa = setupQaTestHarness(() => ({
  pipeline: (input) => realQaPipeline({ ...input, callModel }),
}));

beforeEach(() => {
  callModel = withProvider();
});

async function ask(targetId = targetA.target.id, question = QUESTION) {
  return qa().ask(targetId, question);
}

function expectError(result: QaAskResult, key: QaPipelineErrorKey) {
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expectErrorShape(result.error, QA_PIPELINE_ERRORS[key]);
    // User-facing messages never echo provider bodies or review text.
    expect(String(result.error)).not.toMatch(/QA_HARNESS_PRIVATE|QA_TARGET_A/);
  }
}

/** The provider-neutral request as reconstructed from what was actually sent over the wire. */
function sentRequest(call: FakeOpenAiCall, targetId: string): QaModelRequest {
  const input = String(call.body.input);
  const lines = input.split("\n");
  const header = lines.findIndex((line) => line.startsWith("REVIEW DATASET ("));
  const rows = JSON.parse(lines[header + 1]) as { id: string }[];
  return {
    promptVersion: SYSTEM_PROMPT_VERSION,
    targetId,
    instructions: String(call.body.instructions),
    input,
    reviewIds: rows.map((row) => row.id),
    maxOutputTokens: Number(call.body.max_output_tokens),
  };
}

describe("outgoing request body", () => {
  it("counts tokens, then generates, with the same model, instructions, input and schema", async () => {
    const result = await ask();
    expect(result.ok).toBe(true);
    expect(provider.calls.map((call) => call.url)).toEqual([
      FAKE_OPENAI_COUNT_URL,
      FAKE_OPENAI_RESPONSES_URL,
    ]);
    const [count, generation] = provider.calls;
    expect(count.body).toEqual({
      model: generation.body.model,
      instructions: generation.body.instructions,
      input: generation.body.input,
      text: generation.body.text,
    });
  });

  it("sends store:false, the output budget, and the strict S2-011 JSON schema", async () => {
    await ask();
    const [generation] = provider.generationCalls();
    expect(generation.body).toEqual({
      model: "qa-harness-synthetic-model",
      instructions: expect.any(String),
      input: expect.any(String),
      max_output_tokens: QA_RESERVED_OUTPUT_TOKENS,
      store: false,
      text: {
        format: {
          type: "json_schema",
          name: "reviewlens_qa_reply",
          schema: QA_REPLY_JSON_SCHEMA,
          strict: true,
        },
      },
    });
    expect(generation).toMatchObject({ method: "POST", cache: "no-store", hasAbortSignal: true });
    expect(generation.headers).toMatchObject({
      authorization: "Bearer qa-harness-synthetic-key-not-live",
      "content-type": "application/json",
    });
  });

  it("splits trusted instructions from untrusted input", async () => {
    await ask();
    const [generation] = provider.generationCalls();
    const instructions = String(generation.body.instructions);
    const input = String(generation.body.input);

    expect(instructions).toBe(buildSystemPrompt(REVIEW_PLATFORM_LABELS[targetA.target.platform]));
    for (const review of targetA.reviews) {
      expect(instructions).not.toContain(review.text);
      expect(input).toContain(JSON.stringify(review.text));
    }
    expect(instructions).not.toContain(QUESTION);
    expect(input.endsWith(JSON.stringify(QUESTION))).toBe(true);
  });

  it("the wire body carries only the active target, even after a switch", async () => {
    const checkLast = (active: QaFixtureDataset) => {
      const call = provider.generationCalls().at(-1);
      if (!call) throw new Error("no generation call");
      const request = sentRequest(call, active.target.id);
      const foreign = allQaDatasets().filter((dataset) => dataset.key !== active.key);
      expectNoForeignData(request, foreign);
      expectContextOnlyForTarget(request, active);
      expectNoReviewerIdentity(request, active);
      const countBody = JSON.stringify(provider.countCalls().at(-1)?.body);
      for (const dataset of foreign) {
        for (const review of dataset.reviews) expect(countBody).not.toContain(review.id);
      }
    };
    await ask(targetA.target.id);
    checkLast(targetA);
    await ask(targetB.target.id);
    checkLast(targetB);
  });
});

describe("provider replies", () => {
  it("returns a validated answer with usage and the counted input tokens", async () => {
    callModel = withProvider({ count: openAi.count(1_234) });
    const result = await ask();
    expect(result).toMatchObject({
      ok: true,
      answer: {
        outcome: "answered",
        citedReviewIds: [targetA.reviews[0].id],
        promptVersion: SYSTEM_PROMPT_VERSION,
        targetId: targetA.target.id,
      },
    });
    const reply = await callModel({
      promptVersion: SYSTEM_PROMPT_VERSION,
      targetId: targetA.target.id,
      instructions: "x",
      input: `REVIEW DATASET (1 reviews, JSON array):\n[{"id":"r1","text":"Synthetic review text for the provider."}]\n\nQUESTION (JSON string):\n"q"`,
      reviewIds: ["r1"],
      maxOutputTokens: QA_RESERVED_OUTPUT_TOKENS,
    });
    expect(reply).toMatchObject({
      countedInputTokens: 1_234,
      usage: { inputTokens: 1_000, outputTokens: 50 },
    });
  });

  it.each<[string, FakeOpenAiFetchOptions, QaPipelineErrorKey]>([
    ["generation HTTP 429", { generation: openAi.status(429) }, "modelRateLimited"],
    ["generation HTTP 401", { generation: openAi.status(401) }, "modelAuth"],
    ["generation HTTP 400", { generation: openAi.status(400) }, "modelRejected"],
    ["generation HTTP 500", { generation: openAi.status(500) }, "modelUnavailable"],
    ["generation HTTP 408", { generation: openAi.status(408) }, "modelUnavailable"],
    ["generation network error", { generation: openAi.networkError() }, "modelUnavailable"],
    ["generation timeout", { generation: openAi.timeout() }, "modelTimeout"],
    ["a body that is not JSON", { generation: openAi.text("<html>oops</html>") }, "modelFailed"],
    ["a non-object body", { generation: openAi.json([1, 2]) }, "modelFailed"],
    [
      "status other than completed",
      { generation: openAi.json({ status: "failed" }) },
      "modelFailed",
    ],
    [
      "a completed reply with no text",
      { generation: openAi.json({ status: "completed", output: [] }) },
      "modelFailed",
    ],
    ["an incomplete reply", { generation: openAi.incomplete() }, "responseIncomplete"],
    ["a refusal", { generation: openAi.refusal() }, "modelRefused"],
    [
      "prose instead of JSON",
      { generation: openAi.completed("Sure, it's great!") },
      "invalidModelResponse",
    ],
    [
      "a citation outside the request",
      {
        generation: openAi.completed(
          claimReply.answered([claimFrom("Invented.", targetB.reviews[0])]),
        ),
      },
      "ungroundedAnswer",
    ],
    [
      "a cited decline",
      {
        generation: openAi.completed(
          claimReply.declined("declined_other_platform", [
            claimFrom("Reviews.", targetA.reviews[0]),
          ]),
        ),
      },
      "unexpectedCitations",
    ],
    [
      "a valid citation whose quote is not in that review",
      {
        generation: openAi.completed(
          claimReply.answered([
            {
              statement: "Invented finding.",
              evidence: [evidenceFrom(targetA.reviews[0], "words that this review never says")],
            },
          ]),
        ),
      },
      "unsupportedClaim",
    ],
  ])("maps %s to a typed error", async (_label, options, key) => {
    callModel = withProvider(options);
    expectError(await ask(), key);
    expect(provider.generationCalls()).toHaveLength(1);
  });

  it.each<[string, FakeOpenAiFetchOptions, QaPipelineErrorKey]>([
    ["HTTP 503", { count: openAi.status(503) }, "modelUnavailable"],
    ["a timeout", { count: openAi.timeout() }, "modelTimeout"],
    [
      "a malformed count",
      { count: openAi.json({ object: "response", input_tokens: 5 }) },
      "budgetCheckFailed",
    ],
    ["a non-integer count", { count: openAi.count(12.5) }, "budgetCheckFailed"],
    ["a negative count", { count: openAi.count(-1) }, "budgetCheckFailed"],
  ])("never generates when the token count fails with %s", async (_label, options, key) => {
    callModel = withProvider(options);
    expectError(await ask(), key);
    expect(provider.countCalls()).toHaveLength(1);
    expect(provider.generationCalls()).toHaveLength(0);
  });
});

describe("provider token budget (separate from the service-boundary question limit)", () => {
  const limit = QA_MAX_REQUEST_TOKENS - QA_RESERVED_OUTPUT_TOKENS;

  it(`generates at exactly ${limit} counted input tokens`, async () => {
    callModel = withProvider({ count: openAi.count(limit) });
    expect((await ask()).ok).toBe(true);
    expect(provider.generationCalls()).toHaveLength(1);
  });

  it(`rejects ${limit + 1} counted tokens as QaPromptError/REQUEST_TOO_LARGE without generating`, async () => {
    callModel = withProvider({ count: openAi.count(limit + 1) });
    const result = await ask();
    expectError(result, "requestTooLarge");
    expect(result.contextBuilds).toBe(1);
    expect(provider.countCalls()).toHaveLength(1);
    expect(provider.generationCalls()).toHaveLength(0);
  });

  it("an over-long question is rejected earlier, with no provider call at all", async () => {
    const result = await ask(targetA.target.id, "x".repeat(2_001));
    expectError(result, "questionTooLong");
    expect(result.contextBuilds).toBe(0);
    expect(provider.calls).toHaveLength(0);
  });
});

describe("configuration and isolation", () => {
  it("runs with no real credential in the environment and the network blocked", async () => {
    expect(process.env.OPENAI_API_KEY).toBeUndefined();
    expect(process.env.QA_ENABLED).toBeUndefined();
    await expect(fetch("https://api.openai.com/v1/responses")).rejects.toThrow(/Blocked/);
    qa().network.clearAttempts();
  });

  it("fails closed as QA_DISABLED from the real (scrubbed) process.env, with no fetch", async () => {
    provider = createFakeOpenAiFetch();
    callModel = createOpenAiQaModel({ fetcher: provider.fetcher });
    expectError(await ask(), "qaDisabled");
    expect(provider.calls).toHaveLength(0);
  });

  it("fails closed when enabled without a key, with no fetch", async () => {
    callModel = withProvider({}, { ...FAKE_OPENAI_ENV, OPENAI_API_KEY: "" });
    expectError(await ask(), "apiKeyNotConfigured");
    expect(provider.calls).toHaveLength(0);
  });

  it("never contacts the provider when authorization fails", async () => {
    qa().setActor(null);
    expectError(await ask(), "authRequired");
    qa().setActor(getQaDataset("userBPrivate").owner);
    expectError(await ask(targetA.target.id), "targetNotFound");
    expect(provider.calls).toHaveLength(0);
  });
});
