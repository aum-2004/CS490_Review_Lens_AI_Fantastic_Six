/** @jest-environment node */

import {
  MAX_OPENAI_RESPONSE_BYTES,
  OPENAI_TIMEOUT_MS,
  QaModelError,
  createOpenAiQaModel,
  extractReply,
  readOpenAiQaConfig,
  type QaModelErrorCode,
} from "@/services/qa/openai-qa-client";
import { QA_REPLY_JSON_SCHEMA } from "@/services/qa/qa-response";
import type { QaModelRequest } from "@/services/qa/system-prompt";

jest.mock("server-only", () => ({}));

const API_KEY = "test-openai-key-SECRET_MARKER";
const env = { QA_ENABLED: "true", OPENAI_API_KEY: API_KEY, OPENAI_QA_MODEL: "test-model" };

const request: QaModelRequest = {
  promptVersion: "s2-013.v2",
  targetId: "target-1",
  instructions: "TRUSTED_RULES",
  input: "UNTRUSTED_REVIEWS_AND_QUESTION",
  reviewIds: ["r1"],
  estimatedInputTokens: 100,
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

const jsonResponse = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), { status: 200, ...init });

function fakeFetch(response: Response | Error) {
  return jest.fn<Promise<Response>, Parameters<typeof fetch>>(async () => {
    if (!(response instanceof Response)) throw response;
    return response;
  });
}

async function codeOf(promise: Promise<unknown>): Promise<QaModelErrorCode> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(QaModelError);
    expect((error as Error).message).not.toContain("SECRET_MARKER");
    return (error as QaModelError).code;
  }
  throw new Error("Expected a QaModelError.");
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
    expect(readOpenAiQaConfig({ ...env, OPENAI_QA_MODEL: " test-model " })).toEqual({
      apiKey: API_KEY,
      model: "test-model",
    });
  });
});

describe("createOpenAiQaModel", () => {
  it("never calls the provider when Q&A is disabled or not configured", async () => {
    const fetcher = fakeFetch(jsonResponse(completed()));

    expect(await codeOf(createOpenAiQaModel({ fetcher, env: {} })(request))).toBe("QA_DISABLED");
    expect(
      await codeOf(createOpenAiQaModel({ fetcher, env: { ...env, OPENAI_API_KEY: "" } })(request)),
    ).toBe("API_KEY_NOT_CONFIGURED");
    expect(
      await codeOf(createOpenAiQaModel({ fetcher, env: { ...env, OPENAI_QA_MODEL: "" } })(request)),
    ).toBe("MODEL_NOT_CONFIGURED");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("sends exactly the configured model, never a substitute", async () => {
    const fetcher = fakeFetch(jsonResponse(completed()));

    await createOpenAiQaModel({ fetcher, env: { ...env, OPENAI_QA_MODEL: "team-chosen-model" } })(
      request,
    );

    expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body)).model).toBe("team-chosen-model");
  });

  it("sends one Responses API request with isolated instructions and input", async () => {
    const fetcher = fakeFetch(jsonResponse(completed()));
    const timeoutSpy = jest.spyOn(AbortSignal, "timeout");

    await createOpenAiQaModel({ fetcher, env })(request);

    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/responses");
    expect(init?.method).toBe("POST");
    expect(new Headers(init?.headers).get("authorization")).toBe(`Bearer ${API_KEY}`);
    expect(timeoutSpy).toHaveBeenCalledWith(OPENAI_TIMEOUT_MS);

    const body = JSON.parse(String(init?.body));
    expect(body).toEqual({
      model: "test-model",
      instructions: "TRUSTED_RULES",
      input: "UNTRUSTED_REVIEWS_AND_QUESTION",
      max_output_tokens: 1_500,
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
    // Untrusted content never reaches the system-level instructions.
    expect(body.instructions).not.toContain("UNTRUSTED");
    timeoutSpy.mockRestore();
  });

  it("returns the reply text and provider-reported usage", async () => {
    const reply = await createOpenAiQaModel({
      fetcher: fakeFetch(jsonResponse(completed())),
      env,
    })(request);

    expect(reply).toEqual({ text: REPLY_TEXT, usage: { inputTokens: 120, outputTokens: 30 } });
  });

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
    const fetcher = fakeFetch(
      new Response(JSON.stringify({ error: { message: "PROVIDER_DETAIL_MARKER" } }), { status }),
    );

    let thrown: unknown;
    try {
      await createOpenAiQaModel({ fetcher, env })(request);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toMatchObject({ name: "QaModelError", code });
    expect((thrown as Error).message).not.toContain("PROVIDER_DETAIL_MARKER");
  });

  it.each<[string, Error, QaModelErrorCode]>([
    ["a timeout", new DOMException("timed out", "TimeoutError"), "MODEL_TIMEOUT"],
    ["an abort", new DOMException("aborted", "AbortError"), "MODEL_TIMEOUT"],
    ["a network failure", new TypeError("fetch failed SECRET_MARKER"), "MODEL_UNAVAILABLE"],
  ])("maps %s to %s", async (_label, failure, code) => {
    expect(await codeOf(createOpenAiQaModel({ fetcher: fakeFetch(failure), env })(request))).toBe(
      code,
    );
  });

  it("maps a timeout while reading the body to MODEL_TIMEOUT", async () => {
    const body = new ReadableStream({
      pull(controller) {
        controller.error(new DOMException("timed out", "TimeoutError"));
      },
    });
    expect(
      await codeOf(createOpenAiQaModel({ fetcher: fakeFetch(new Response(body)), env })(request)),
    ).toBe("MODEL_TIMEOUT");
  });

  it("rejects a response declared larger than the limit without reading it", async () => {
    const response = jsonResponse(completed(), {
      headers: { "content-length": String(MAX_OPENAI_RESPONSE_BYTES + 1) },
    });
    expect(await codeOf(createOpenAiQaModel({ fetcher: fakeFetch(response), env })(request))).toBe(
      "MODEL_FAILED",
    );
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
    expect(
      await codeOf(createOpenAiQaModel({ fetcher: fakeFetch(new Response(body)), env })(request)),
    ).toBe("MODEL_FAILED");
    expect(sent * chunk.byteLength).toBeLessThanOrEqual(
      MAX_OPENAI_RESPONSE_BYTES + chunk.byteLength * 2,
    );
  });

  it("rejects a non-JSON body", async () => {
    const response = new Response("<html>gateway</html>", { status: 200 });
    expect(await codeOf(createOpenAiQaModel({ fetcher: fakeFetch(response), env })(request))).toBe(
      "MODEL_FAILED",
    );
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

describe("createOpenAiQaModel defaults and stream failures", () => {
  it("uses the global fetch when no fetcher is injected", async () => {
    const globalFetch = jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse(completed()));

    await expect(createOpenAiQaModel({ env })(request)).resolves.toMatchObject({
      text: REPLY_TEXT,
    });
    expect(globalFetch).toHaveBeenCalledTimes(1);
    globalFetch.mockRestore();
  });

  it("maps a non-timeout failure while reading the body to MODEL_UNAVAILABLE", async () => {
    const body = new ReadableStream({
      pull(controller) {
        controller.error(new TypeError("socket closed SECRET_MARKER"));
      },
    });
    expect(
      await codeOf(createOpenAiQaModel({ fetcher: fakeFetch(new Response(body)), env })(request)),
    ).toBe("MODEL_UNAVAILABLE");
  });
});
