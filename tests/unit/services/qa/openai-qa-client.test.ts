/** @jest-environment node */

import {
  MAX_OPENAI_RESPONSE_BYTES,
  OPENAI_INPUT_TOKENS_URL,
  OPENAI_RESPONSES_URL,
  OPENAI_TIMEOUT_MS,
  QaModelError,
  buildInputTokenCountBody,
  buildOpenAiRequestBody,
  createOpenAiQaModel,
  extractReply,
  readOpenAiQaConfig,
  type QaModelErrorCode,
} from "@/services/qa/openai-qa-client";
import { QA_REPLY_JSON_SCHEMA } from "@/services/qa/qa-response";
import type { QaModelRequest } from "@/services/qa/system-prompt";
import { MAX_COUNTABLE_REQUEST_BYTES } from "@/services/qa/token-budget";

jest.mock("server-only", () => ({}));

const API_KEY = "test-openai-key-SECRET_MARKER";
const env = { QA_ENABLED: "true", OPENAI_API_KEY: API_KEY, OPENAI_QA_MODEL: "gpt-6-luna" };

const request: QaModelRequest = {
  promptVersion: "s2-013.v3",
  targetId: "target-1",
  instructions: "TRUSTED_RULES",
  input: "UNTRUSTED_REVIEWS_AND_QUESTION",
  reviewIds: ["r1"],
  maxOutputTokens: 1_500,
};

const REPLY_TEXT = JSON.stringify({ outcome: "answered", answer: "ok", citedReviewIds: ["r1"] });

function completed(text = REPLY_TEXT, extra: Record<string, unknown> = {}) {
  return {
    object: "response",
    status: "completed",
    output: [
      { type: "reasoning", summary: [] },
      { type: "message", role: "assistant", content: [{ type: "output_text", text }] },
    ],
    usage: { input_tokens: 120, output_tokens: 30 },
    ...extra,
  };
}

const countBody = (inputTokens: unknown = 120) => ({
  object: "response.input_tokens",
  input_tokens: inputTokens,
});

const jsonResponse = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), { status: 200, ...init });

type Reply = Response | Error;

/**
 * Fake OpenAI: routes the token-count and generation endpoints separately, so tests can assert
 * that the generation endpoint is (or is not) called.
 */
function provider({
  count = () => jsonResponse(countBody()),
  generation = () => jsonResponse(completed()),
}: { count?: () => Reply; generation?: () => Reply } = {}) {
  const fetcher = jest.fn<Promise<Response>, Parameters<typeof fetch>>(async (url) => {
    const reply = String(url) === OPENAI_INPUT_TOKENS_URL ? count() : generation();
    if (!(reply instanceof Response)) throw reply;
    return reply;
  });
  const callsTo = (url: string) => fetcher.mock.calls.filter(([u]) => String(u) === url);
  return {
    fetcher,
    countCalls: () => callsTo(OPENAI_INPUT_TOKENS_URL),
    generationCalls: () => callsTo(OPENAI_RESPONSES_URL),
  };
}

const bodyOf = (call: Parameters<typeof fetch>) => JSON.parse(String(call[1]?.body));

async function rejectionOf(promise: Promise<unknown>): Promise<Error & { code?: string }> {
  try {
    await promise;
  } catch (error) {
    expect((error as Error).message).not.toContain("SECRET_MARKER");
    return error as Error & { code?: string };
  }
  throw new Error("Expected a rejection.");
}

async function codeOf(promise: Promise<unknown>): Promise<QaModelErrorCode> {
  const error = await rejectionOf(promise);
  expect(error).toBeInstanceOf(QaModelError);
  return (error as QaModelError).code;
}

describe("readOpenAiQaConfig", () => {
  it.each([{}, { QA_ENABLED: "false" }, { QA_ENABLED: "TRUE" }, { QA_ENABLED: "1" }])(
    "is disabled unless QA_ENABLED is exactly true (%j)",
    (flags) => {
      expect(() => readOpenAiQaConfig({ ...env, QA_ENABLED: undefined, ...flags })).toThrow(
        expect.objectContaining({ code: "QA_DISABLED" }),
      );
    },
  );

  it.each([{ OPENAI_API_KEY: undefined }, { OPENAI_API_KEY: "  " }])(
    "requires an API key (%j)",
    (missing) => {
      expect(() => readOpenAiQaConfig({ ...env, ...missing })).toThrow(
        expect.objectContaining({
          code: "API_KEY_NOT_CONFIGURED",
          detail: "OPENAI_API_KEY is not set.",
        }),
      );
    },
  );

  it.each([{ OPENAI_QA_MODEL: undefined }, { OPENAI_QA_MODEL: "" }, { OPENAI_QA_MODEL: "  " }])(
    "requires OPENAI_QA_MODEL with no fallback model (%j)",
    (missing) => {
      let thrown: unknown;
      try {
        readOpenAiQaConfig({ ...env, ...missing });
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toMatchObject({ name: "QaModelError", code: "MODEL_NOT_CONFIGURED" });
      expect((thrown as QaModelError).detail).toMatch(/OPENAI_QA_MODEL is not set.*no default/);
      // The user-facing message stays generic; the detail is for server logs only.
      expect((thrown as Error).message).toBe("Review Q&A is not configured.");
    },
  );

  it("returns the trimmed configuration", () => {
    expect(readOpenAiQaConfig({ ...env, OPENAI_QA_MODEL: " gpt-6-luna " })).toEqual({
      apiKey: API_KEY,
      model: "gpt-6-luna",
    });
  });
});

describe("createOpenAiQaModel request flow", () => {
  it("never calls the provider when Q&A is disabled or not configured", async () => {
    const { fetcher } = provider();

    expect(await codeOf(createOpenAiQaModel({ fetcher, env: {} })(request))).toBe("QA_DISABLED");
    expect(
      await codeOf(createOpenAiQaModel({ fetcher, env: { ...env, OPENAI_API_KEY: "" } })(request)),
    ).toBe("API_KEY_NOT_CONFIGURED");
    expect(
      await codeOf(createOpenAiQaModel({ fetcher, env: { ...env, OPENAI_QA_MODEL: "" } })(request)),
    ).toBe("MODEL_NOT_CONFIGURED");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("counts tokens first, then generates, with the same model, instructions, input, and format", async () => {
    const { fetcher } = provider();
    const timeoutSpy = jest.spyOn(AbortSignal, "timeout");

    await createOpenAiQaModel({ fetcher, env })(request);

    expect(fetcher.mock.calls.map(([url]) => String(url))).toEqual([
      OPENAI_INPUT_TOKENS_URL,
      OPENAI_RESPONSES_URL,
    ]);
    for (const [, init] of fetcher.mock.calls) {
      expect(init?.method).toBe("POST");
      expect(new Headers(init?.headers).get("authorization")).toBe(`Bearer ${API_KEY}`);
    }
    expect(timeoutSpy).toHaveBeenCalledTimes(2);
    expect(timeoutSpy).toHaveBeenCalledWith(OPENAI_TIMEOUT_MS);

    const format = {
      type: "json_schema",
      name: "reviewlens_qa_reply",
      schema: QA_REPLY_JSON_SCHEMA,
      strict: true,
    };
    expect(bodyOf(fetcher.mock.calls[0])).toEqual({
      model: "gpt-6-luna",
      instructions: "TRUSTED_RULES",
      input: "UNTRUSTED_REVIEWS_AND_QUESTION",
      text: { format },
    });
    const generation = bodyOf(fetcher.mock.calls[1]);
    expect(generation).toEqual({
      model: "gpt-6-luna",
      instructions: "TRUSTED_RULES",
      input: "UNTRUSTED_REVIEWS_AND_QUESTION",
      max_output_tokens: 1_500,
      store: false,
      text: { format },
    });
    // Untrusted content never reaches the system-level instructions.
    expect(generation.instructions).not.toContain("UNTRUSTED");
    timeoutSpy.mockRestore();
  });

  it("builds the count body from exactly the generation body's input fields", () => {
    const body = buildOpenAiRequestBody(request, "gpt-6-luna");
    expect(buildInputTokenCountBody(body)).toEqual({
      model: body.model,
      instructions: body.instructions,
      input: body.input,
      text: body.text,
    });
  });

  it("sends exactly the configured model to both endpoints, never a substitute", async () => {
    const { fetcher } = provider();

    await createOpenAiQaModel({ fetcher, env: { ...env, OPENAI_QA_MODEL: "gpt-4.1-mini" } })(
      request,
    );

    expect(fetcher.mock.calls.map((call) => bodyOf(call).model)).toEqual([
      "gpt-4.1-mini",
      "gpt-4.1-mini",
    ]);
  });

  it("returns the reply, provider usage, and the pre-generation token count", async () => {
    const { fetcher } = provider({ count: () => jsonResponse(countBody(118)) });

    await expect(createOpenAiQaModel({ fetcher, env })(request)).resolves.toEqual({
      text: REPLY_TEXT,
      usage: { inputTokens: 120, outputTokens: 30 },
      countedInputTokens: 118,
    });
  });

  it("uses the global fetch when no fetcher is injected", async () => {
    const globalFetch = jest
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (url) =>
        String(url) === OPENAI_INPUT_TOKENS_URL
          ? jsonResponse(countBody())
          : jsonResponse(completed()),
      );

    await expect(createOpenAiQaModel({ env })(request)).resolves.toMatchObject({
      text: REPLY_TEXT,
    });
    expect(globalFetch).toHaveBeenCalledTimes(2);
    globalFetch.mockRestore();
  });
});

describe("token budget (input_tokens + 1,500 <= 16,000)", () => {
  it("allows generation at exactly 14,500 input tokens", async () => {
    const { fetcher, generationCalls } = provider({
      count: () => jsonResponse(countBody(14_500)),
    });

    await expect(createOpenAiQaModel({ fetcher, env })(request)).resolves.toMatchObject({
      countedInputTokens: 14_500,
    });
    expect(generationCalls()).toHaveLength(1);
    expect(bodyOf(generationCalls()[0]).max_output_tokens).toBe(1_500);
  });

  it("blocks generation at 14,501 input tokens", async () => {
    const { fetcher, countCalls, generationCalls } = provider({
      count: () => jsonResponse(countBody(14_501)),
    });

    const error = await rejectionOf(createOpenAiQaModel({ fetcher, env })(request));
    expect(error).toMatchObject({ name: "QaPromptError", code: "REQUEST_TOO_LARGE" });
    expect(countCalls()).toHaveLength(1);
    expect(generationCalls()).toHaveLength(0);
  });

  it("applies an injected budget the same way", async () => {
    const budget = { maxRequestTokens: 2_000, reservedOutputTokens: 1_500 };
    const ok = provider({ count: () => jsonResponse(countBody(500)) });
    const over = provider({ count: () => jsonResponse(countBody(501)) });

    await createOpenAiQaModel({ fetcher: ok.fetcher, env, budget })(request);
    await rejectionOf(createOpenAiQaModel({ fetcher: over.fetcher, env, budget })(request));

    expect(ok.generationCalls()).toHaveLength(1);
    expect(over.generationCalls()).toHaveLength(0);
  });

  it.each<[string, unknown]>([
    ["a missing count", { object: "response.input_tokens" }],
    ["a negative count", countBody(-1)],
    ["a fractional count", countBody(14_000.5)],
    ["a string count", countBody("14000")],
    ["a null count", { object: "response.input_tokens", input_tokens: null }],
    ["an unsafe integer", countBody(Number.MAX_SAFE_INTEGER + 2)],
    ["the wrong object type", { object: "response", input_tokens: 10 }],
    ["a non-object body", [10]],
  ])("fails closed with zero generation calls for %s", async (_label, body) => {
    const { fetcher, generationCalls } = provider({ count: () => jsonResponse(body) });

    const error = await rejectionOf(createOpenAiQaModel({ fetcher, env })(request));
    expect(error).toMatchObject({ name: "QaBudgetError", code: "BUDGET_CHECK_FAILED" });
    expect(generationCalls()).toHaveLength(0);
  });

  it.each<[string, () => Reply, string]>([
    ["HTTP 429", () => new Response("{}", { status: 429 }), "MODEL_RATE_LIMITED"],
    ["HTTP 401", () => new Response("{}", { status: 401 }), "MODEL_AUTH"],
    ["HTTP 400", () => new Response("{}", { status: 400 }), "MODEL_REJECTED"],
    ["HTTP 500", () => new Response("{}", { status: 500 }), "MODEL_UNAVAILABLE"],
    ["a timeout", () => new DOMException("timed out", "TimeoutError"), "MODEL_TIMEOUT"],
    ["a network failure", () => new TypeError("fetch failed SECRET_MARKER"), "MODEL_UNAVAILABLE"],
    ["a non-JSON body", () => new Response("<html>gateway</html>"), "MODEL_FAILED"],
  ])(
    "makes zero generation calls when the count request fails with %s",
    async (_label, count, code) => {
      const { fetcher, generationCalls } = provider({ count });

      const error = await rejectionOf(createOpenAiQaModel({ fetcher, env })(request));
      expect(error).toMatchObject({ name: "QaModelError", code });
      expect(generationCalls()).toHaveLength(0);
    },
  );

  it("names the failing stage in the log-only detail", async () => {
    const { fetcher } = provider({ count: () => new Response("{}", { status: 503 }) });

    const error = await rejectionOf(createOpenAiQaModel({ fetcher, env })(request));
    expect((error as QaModelError).detail).toBe("OpenAI token count request failed with HTTP 503.");
  });

  it("makes no provider calls at all for a payload over the size ceiling", async () => {
    const { fetcher } = provider();
    const huge = { ...request, input: "x".repeat(MAX_COUNTABLE_REQUEST_BYTES) };

    const error = await rejectionOf(createOpenAiQaModel({ fetcher, env })(huge));
    expect(error).toMatchObject({ name: "QaPromptError", code: "REQUEST_TOO_LARGE" });
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe("generation request failures", () => {
  it.each<[number, QaModelErrorCode]>([
    [429, "MODEL_RATE_LIMITED"],
    [401, "MODEL_AUTH"],
    [403, "MODEL_AUTH"],
    [400, "MODEL_REJECTED"],
    [404, "MODEL_REJECTED"],
    [408, "MODEL_UNAVAILABLE"],
    [500, "MODEL_UNAVAILABLE"],
    [503, "MODEL_UNAVAILABLE"],
  ])("maps HTTP %i to %s without exposing the provider body", async (status, code) => {
    const { fetcher } = provider({
      generation: () =>
        new Response(JSON.stringify({ error: { message: "PROVIDER_DETAIL_MARKER" } }), { status }),
    });

    const error = await rejectionOf(createOpenAiQaModel({ fetcher, env })(request));
    expect(error).toMatchObject({ name: "QaModelError", code });
    expect(error.message).not.toContain("PROVIDER_DETAIL_MARKER");
    expect((error as QaModelError).detail).toBe(
      `OpenAI generation request failed with HTTP ${status}.`,
    );
  });

  it.each<[string, Error, QaModelErrorCode]>([
    ["a timeout", new DOMException("timed out", "TimeoutError"), "MODEL_TIMEOUT"],
    ["an abort", new DOMException("aborted", "AbortError"), "MODEL_TIMEOUT"],
    ["a network failure", new TypeError("fetch failed SECRET_MARKER"), "MODEL_UNAVAILABLE"],
  ])("maps %s to %s", async (_label, failure, code) => {
    const { fetcher } = provider({ generation: () => failure });
    expect(await codeOf(createOpenAiQaModel({ fetcher, env })(request))).toBe(code);
  });

  it.each<[string, Error, QaModelErrorCode]>([
    ["a timeout", new DOMException("timed out", "TimeoutError"), "MODEL_TIMEOUT"],
    ["a socket failure", new TypeError("socket closed SECRET_MARKER"), "MODEL_UNAVAILABLE"],
  ])("maps %s while reading the body to %s", async (_label, failure, code) => {
    const body = new ReadableStream({
      pull(controller) {
        controller.error(failure);
      },
    });
    const { fetcher } = provider({ generation: () => new Response(body) });
    expect(await codeOf(createOpenAiQaModel({ fetcher, env })(request))).toBe(code);
  });

  it("rejects a response declared larger than the limit without reading it", async () => {
    const { fetcher } = provider({
      generation: () =>
        jsonResponse(completed(), {
          headers: { "content-length": String(MAX_OPENAI_RESPONSE_BYTES + 1) },
        }),
    });
    expect(await codeOf(createOpenAiQaModel({ fetcher, env })(request))).toBe("MODEL_FAILED");
  });

  it("stops reading a streamed response once it passes the limit", async () => {
    const chunk = new Uint8Array(64 * 1024);
    let sent = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        sent += 1;
        controller.enqueue(chunk);
      },
    });
    const { fetcher } = provider({ generation: () => new Response(body) });

    expect(await codeOf(createOpenAiQaModel({ fetcher, env })(request))).toBe("MODEL_FAILED");
    expect(sent * chunk.byteLength).toBeLessThanOrEqual(
      MAX_OPENAI_RESPONSE_BYTES + chunk.byteLength * 2,
    );
  });

  it("rejects a non-JSON body", async () => {
    const { fetcher } = provider({ generation: () => new Response("<html>gateway</html>") });
    expect(await codeOf(createOpenAiQaModel({ fetcher, env })(request))).toBe("MODEL_FAILED");
  });
});

describe("extractReply", () => {
  it("joins output_text parts and omits usage when it is missing", () => {
    const body = completed("", { usage: undefined });
    body.output[1] = {
      type: "message",
      role: "assistant",
      content: [
        { type: "output_text", text: '{"outcome":' },
        { type: "output_text", text: '"answered"}' },
      ],
    };
    expect(extractReply(body)).toEqual({ text: '{"outcome":"answered"}' });
  });

  it.each<[string, unknown, QaModelErrorCode]>([
    ["an incomplete response", { status: "incomplete", output: [] }, "RESPONSE_INCOMPLETE"],
    ["a failed response", { status: "failed", output: [] }, "MODEL_FAILED"],
    ["an unknown status", { status: "queued", output: [] }, "MODEL_FAILED"],
    ["a non-object body", ["completed"], "MODEL_FAILED"],
    ["a missing output array", { status: "completed" }, "MODEL_FAILED"],
    ["no text output", { status: "completed", output: [{ type: "reasoning" }] }, "MODEL_FAILED"],
    ["empty text", completed("   "), "MODEL_FAILED"],
    [
      "a refusal",
      {
        status: "completed",
        output: [
          {
            type: "message",
            content: [
              { type: "output_text", text: REPLY_TEXT },
              { type: "refusal", refusal: "I can't help with that." },
            ],
          },
        ],
      },
      "MODEL_REFUSED",
    ],
  ])("rejects %s", (_label, body, code) => {
    expect(() => extractReply(body)).toThrow(expect.objectContaining({ code }));
  });

  it("ignores malformed output items and content parts", () => {
    const body = {
      status: "completed",
      output: [
        null,
        { type: "message", content: "not-an-array" },
        {
          type: "message",
          content: [null, { type: "output_text", text: 5 }, { type: "output_text", text: "ok" }],
        },
      ],
      usage: { input_tokens: "120", output_tokens: 3 },
    };
    expect(extractReply(body)).toEqual({ text: "ok" });
  });
});
