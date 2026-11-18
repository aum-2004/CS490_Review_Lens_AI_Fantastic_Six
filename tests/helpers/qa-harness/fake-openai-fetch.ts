import type { QaModelReplyPayload } from "./contract";
import { claimFrom, claimReply } from "./grounded-reply";

/**
 * S2-003 fake for the OpenAI Responses API, injected as `createOpenAiQaModel({ fetcher })`. The
 * real adapter builds the request body, counts tokens, enforces the budget, maps HTTP errors and
 * parses the reply; this fake only answers the two endpoints it calls and records what was sent.
 *
 * It never touches the network, and tests pass a synthetic `env`, so no OPENAI_API_KEY is read.
 * Any URL other than the two Responses endpoints is recorded and rejected.
 */

export const FAKE_OPENAI_COUNT_URL = "https://api.openai.com/v1/responses/input_tokens";
export const FAKE_OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";

/** A synthetic environment that enables Q&A without any real credential. */
export const FAKE_OPENAI_ENV: Readonly<Record<string, string | undefined>> = Object.freeze({
  QA_ENABLED: "true",
  OPENAI_API_KEY: "qa-harness-synthetic-key-not-live",
  OPENAI_QA_MODEL: "qa-harness-synthetic-model",
});

export type FakeOpenAiResponse =
  /** HTTP 200 with this JSON body. */
  | { readonly kind: "json"; readonly body: unknown }
  /** HTTP response with this status and raw body text. */
  | { readonly kind: "status"; readonly status: number; readonly text: string }
  /** HTTP 200 with a body that is not JSON. */
  | { readonly kind: "text"; readonly text: string }
  /** fetch rejects the way it does when `AbortSignal.timeout` fires. */
  | { readonly kind: "timeout" }
  /** fetch rejects with a network-level TypeError. */
  | { readonly kind: "network-error" };

type Respond = FakeOpenAiResponse | ((body: Record<string, unknown>) => FakeOpenAiResponse);

export interface FakeOpenAiFetchOptions {
  /** Reply to POST /v1/responses/input_tokens. Default: 1,000 tokens. */
  readonly count?: Respond;
  /** Reply to POST /v1/responses. Default: an answer citing the first supplied review. */
  readonly generation?: Respond;
}

export interface FakeOpenAiCall {
  readonly url: string;
  readonly method: string | undefined;
  readonly headers: Readonly<Record<string, string>>;
  /** Parsed JSON request body. */
  readonly body: Record<string, unknown>;
  readonly cache: RequestCache | undefined;
  readonly hasAbortSignal: boolean;
}

export interface FakeOpenAiFetch {
  readonly fetcher: typeof fetch;
  readonly calls: readonly FakeOpenAiCall[];
  readonly countCalls: () => FakeOpenAiCall[];
  readonly generationCalls: () => FakeOpenAiCall[];
}

/** Response builders for the fake. */
export const openAi = {
  count(inputTokens: unknown): FakeOpenAiResponse {
    return { kind: "json", body: { object: "response.input_tokens", input_tokens: inputTokens } };
  },
  completed(
    payload: QaModelReplyPayload | string,
    usage: { input_tokens: number; output_tokens: number } | undefined = {
      input_tokens: 1_000,
      output_tokens: 50,
    },
  ): FakeOpenAiResponse {
    const text = typeof payload === "string" ? payload : JSON.stringify(payload);
    return {
      kind: "json",
      body: {
        status: "completed",
        output: [{ type: "message", content: [{ type: "output_text", text }] }],
        ...(usage ? { usage } : {}),
      },
    };
  },
  incomplete(): FakeOpenAiResponse {
    return { kind: "json", body: { status: "incomplete", output: [] } };
  },
  refusal(): FakeOpenAiResponse {
    return {
      kind: "json",
      body: {
        status: "completed",
        output: [{ type: "message", content: [{ type: "refusal", refusal: "No." }] }],
      },
    };
  },
  json(body: unknown): FakeOpenAiResponse {
    return { kind: "json", body };
  },
  status(status: number, text = "QA_HARNESS_PRIVATE_PROVIDER_DIAGNOSTIC"): FakeOpenAiResponse {
    return { kind: "status", status, text };
  },
  text(text: string): FakeOpenAiResponse {
    return { kind: "text", text };
  },
  timeout(): FakeOpenAiResponse {
    return { kind: "timeout" };
  },
  networkError(): FakeOpenAiResponse {
    return { kind: "network-error" };
  },
};

/** Default generation: one claim quoting the first review of the S2-013 dataset in `input`. */
function answerFromInput(body: Record<string, unknown>): FakeOpenAiResponse {
  const input = String(body.input);
  const rows = JSON.parse(input.split("\n")[1]) as { id: string; text: string }[];
  return openAi.completed(claimReply.answered([claimFrom("Fake provider answer.", rows[0])]));
}

function toResponse(spec: FakeOpenAiResponse): Response {
  switch (spec.kind) {
    case "json":
      return new Response(JSON.stringify(spec.body), {
        headers: { "Content-Type": "application/json" },
      });
    case "status":
      return new Response(spec.text, { status: spec.status });
    case "text":
      return new Response(spec.text, { headers: { "Content-Type": "application/json" } });
    case "timeout":
      throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
    case "network-error":
      throw new TypeError("fetch failed");
  }
}

export function createFakeOpenAiFetch(options: FakeOpenAiFetchOptions = {}): FakeOpenAiFetch {
  const calls: FakeOpenAiCall[] = [];
  const resolve = (
    respond: Respond | undefined,
    fallback: Respond,
    body: Record<string, unknown>,
  ) => {
    const chosen = respond ?? fallback;
    return typeof chosen === "function" ? chosen(body) : chosen;
  };

  const fetcher: typeof fetch = async (input, init) => {
    const url = String(input instanceof Request ? input.url : input);
    const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    calls.push({
      url,
      method: init?.method,
      headers: Object.fromEntries(new Headers(init?.headers)),
      body,
      cache: init?.cache,
      hasAbortSignal: init?.signal instanceof AbortSignal,
    });
    if (url === FAKE_OPENAI_COUNT_URL) {
      return toResponse(resolve(options.count, openAi.count(1_000), body));
    }
    if (url === FAKE_OPENAI_RESPONSES_URL) {
      return toResponse(resolve(options.generation, answerFromInput, body));
    }
    throw new Error(`Unexpected provider endpoint in the S2-003 fake: ${url}`);
  };

  return {
    fetcher,
    calls,
    countCalls: () => calls.filter((call) => call.url === FAKE_OPENAI_COUNT_URL),
    generationCalls: () => calls.filter((call) => call.url === FAKE_OPENAI_RESPONSES_URL),
  };
}
