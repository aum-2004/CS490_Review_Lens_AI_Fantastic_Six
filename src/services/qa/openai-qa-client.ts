import "server-only";

import type { QaModelCaller, QaModelReply } from "@/services/qa/answer-question";
import { QA_REPLY_JSON_SCHEMA } from "@/services/qa/qa-response";
import {
  assertCountableSize,
  enforceTokenBudget,
  parseInputTokenCount,
  type QaTokenBudget,
} from "@/services/qa/token-budget";
import type { QaModelRequest } from "@/services/qa/system-prompt";

/**
 * S2-011: OpenAI Responses API adapter, called with fetch (no SDK). Each question makes two calls:
 * POST /v1/responses/input_tokens to count the request, then POST /v1/responses to generate,
 * only if the count fits the budget. Checked against the official API reference and
 * token-counting guide; see docs/s2-011-answers.md for which fields were confirmed.
 */
export const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
export const OPENAI_INPUT_TOKENS_URL = "https://api.openai.com/v1/responses/input_tokens";
export const OPENAI_TIMEOUT_MS = 30_000;
/** A Q&A reply is small; never buffer more than this from the provider. */
export const MAX_OPENAI_RESPONSE_BYTES = 262_144;

export type QaModelErrorCode =
  | "QA_DISABLED"
  | "API_KEY_NOT_CONFIGURED"
  | "MODEL_NOT_CONFIGURED"
  | "MODEL_TIMEOUT"
  | "MODEL_UNAVAILABLE"
  | "MODEL_RATE_LIMITED"
  | "MODEL_AUTH"
  | "MODEL_REJECTED"
  | "MODEL_FAILED"
  | "MODEL_REFUSED"
  | "RESPONSE_INCOMPLETE";

const MESSAGES: Record<QaModelErrorCode, string> = {
  QA_DISABLED: "Review Q&A is not enabled.",
  API_KEY_NOT_CONFIGURED: "Review Q&A is not configured.",
  MODEL_NOT_CONFIGURED: "Review Q&A is not configured.",
  MODEL_TIMEOUT: "The answer took too long. Please try again.",
  MODEL_UNAVAILABLE: "The answer service is unavailable. Please try again later.",
  MODEL_RATE_LIMITED: "Too many questions right now. Please try again shortly.",
  MODEL_AUTH: "Review Q&A is not configured.",
  MODEL_REJECTED: "We couldn't answer that question. Please try rephrasing it.",
  MODEL_FAILED: "We couldn't produce an answer. Please try again.",
  MODEL_REFUSED: "We couldn't answer that question. Please try rephrasing it.",
  RESPONSE_INCOMPLETE: "The answer was cut off. Please try a narrower question.",
};

/** Provider failure. Messages are user-safe and never include provider bodies or review text. */
export class QaModelError extends Error {
  /**
   * @param detail Operator-facing explanation for server logs (for example, which environment
   *   variable is missing). Never contains secrets; never show it to end users.
   */
  constructor(
    readonly code: QaModelErrorCode,
    readonly detail?: string,
  ) {
    super(MESSAGES[code]);
    this.name = "QaModelError";
  }
}

export interface OpenAiQaConfig {
  apiKey: string;
  model: string;
}

/** Environment source. The client reads only QA_ENABLED, OPENAI_API_KEY, and OPENAI_QA_MODEL. */
export type QaEnv = Readonly<Record<string, string | undefined>>;

/** Paid model calls stay off unless QA_ENABLED is exactly "true" (same rule as ingestion). */
export function readOpenAiQaConfig(env: QaEnv = process.env): OpenAiQaConfig {
  if (env.QA_ENABLED !== "true") {
    throw new QaModelError("QA_DISABLED", 'QA_ENABLED is not "true"; Q&A is off.');
  }
  const apiKey = env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new QaModelError("API_KEY_NOT_CONFIGURED", "OPENAI_API_KEY is not set.");
  // No fallback model: the model is a team decision and must be set explicitly.
  const model = env.OPENAI_QA_MODEL?.trim();
  if (!model) {
    throw new QaModelError(
      "MODEL_NOT_CONFIGURED",
      "OPENAI_QA_MODEL is not set. There is no default model; set it explicitly.",
    );
  }
  return { apiKey, model };
}

export function buildOpenAiRequestBody(request: QaModelRequest, model: string) {
  return {
    model,
    // Provider-input isolation: trusted rules go only in `instructions` (system/developer
    // message); untrusted review text and the question go only in `input` (user message).
    instructions: request.instructions,
    input: request.input,
    max_output_tokens: request.maxOutputTokens,
    // Review text is customer data; do not ask the provider to retain the exchange.
    store: false,
    text: {
      format: {
        type: "json_schema",
        name: "reviewlens_qa_reply",
        schema: QA_REPLY_JSON_SCHEMA,
        strict: true,
      },
    },
  };
}

function isTimeoutError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error.name === "TimeoutError" || error.name === "AbortError")
  );
}

async function readBoundedJson(response: Response): Promise<unknown> {
  const declared = Number(response.headers.get("content-length"));
  if (declared > MAX_OPENAI_RESPONSE_BYTES || !response.body) {
    await response.body?.cancel().catch(() => {});
    throw new QaModelError("MODEL_FAILED");
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_OPENAI_RESPONSE_BYTES) {
        await reader.cancel().catch(() => {});
        throw new QaModelError("MODEL_FAILED");
      }
      chunks.push(value);
    }
  } catch (error) {
    // The timeout signal also covers reading the body; never let a raw stream error escape.
    if (error instanceof QaModelError) throw error;
    throw new QaModelError(isTimeoutError(error) ? "MODEL_TIMEOUT" : "MODEL_UNAVAILABLE");
  } finally {
    reader.releaseLock();
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new QaModelError("MODEL_FAILED");
  }
}

type ProviderStage = "token count" | "generation";

function errorForStatus(status: number, stage: ProviderStage): QaModelError {
  const detail = `OpenAI ${stage} request failed with HTTP ${status}.`;
  if (status === 429) return new QaModelError("MODEL_RATE_LIMITED", detail);
  if (status === 401 || status === 403) return new QaModelError("MODEL_AUTH", detail);
  if (status >= 400 && status < 500 && status !== 408) {
    return new QaModelError("MODEL_REJECTED", detail);
  }
  return new QaModelError("MODEL_UNAVAILABLE", detail);
}

/** One provider POST with the shared timeout, error mapping, and bounded JSON read. */
async function postJson(
  url: string,
  payload: unknown,
  apiKey: string,
  stage: ProviderStage,
  fetcher: typeof fetch = fetch,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetcher(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
      cache: "no-store",
      signal: AbortSignal.timeout(OPENAI_TIMEOUT_MS),
    });
  } catch (error) {
    throw new QaModelError(
      isTimeoutError(error) ? "MODEL_TIMEOUT" : "MODEL_UNAVAILABLE",
      `OpenAI ${stage} request could not be completed.`,
    );
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => {});
    throw errorForStatus(response.status, stage);
  }
  return readBoundedJson(response);
}

type Json = Record<string, unknown>;
const isObject = (value: unknown): value is Json =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Reads the reply text from `output[].content[]`; `output_text` is treated as SDK-only. */
export function extractReply(body: unknown): QaModelReply {
  if (!isObject(body)) throw new QaModelError("MODEL_FAILED");
  if (body.status === "incomplete") throw new QaModelError("RESPONSE_INCOMPLETE");
  if (body.status !== "completed" || !Array.isArray(body.output)) {
    throw new QaModelError("MODEL_FAILED");
  }

  const texts: string[] = [];
  for (const item of body.output) {
    if (!isObject(item) || item.type !== "message" || !Array.isArray(item.content)) continue;
    for (const part of item.content) {
      if (!isObject(part)) continue;
      if (part.type === "refusal") throw new QaModelError("MODEL_REFUSED");
      if (part.type === "output_text" && typeof part.text === "string") texts.push(part.text);
    }
  }
  const text = texts.join("");
  if (text.trim() === "") throw new QaModelError("MODEL_FAILED");

  const usage = isObject(body.usage) ? body.usage : undefined;
  return typeof usage?.input_tokens === "number" && typeof usage.output_tokens === "number"
    ? { text, usage: { inputTokens: usage.input_tokens, outputTokens: usage.output_tokens } }
    : { text };
}

/**
 * Body for POST /v1/responses/input_tokens: the same model, instructions, input, and
 * structured-output format as the generation request, so the count covers everything that
 * becomes input. Output-only settings (`max_output_tokens`, `store`) do not change input size and
 * are not confirmed for this endpoint, so they are omitted.
 */
export function buildInputTokenCountBody(body: ReturnType<typeof buildOpenAiRequestBody>) {
  return { model: body.model, instructions: body.instructions, input: body.input, text: body.text };
}

export interface OpenAiQaModelOptions {
  fetcher?: typeof fetch;
  env?: QaEnv;
  /** Tests only. Production always uses QA_TOKEN_BUDGET (16,000 total, 1,500 reserved output). */
  budget?: QaTokenBudget;
}

/**
 * Production QaModelCaller. Configuration is read on every call, so turning QA_ENABLED off takes
 * effect without a restart and a missing key fails closed before any network request.
 *
 * Order: config → build body → size ceiling (no network) → OpenAI token count → budget check →
 * generation. Any failure before the last step throws, so the generation request is never sent.
 */
export function createOpenAiQaModel({
  fetcher,
  env,
  budget,
}: OpenAiQaModelOptions = {}): QaModelCaller {
  return async (request) => {
    const { apiKey, model } = readOpenAiQaConfig(env);
    const body = buildOpenAiRequestBody(request, model);
    const countBody = buildInputTokenCountBody(body);

    assertCountableSize(countBody);
    const inputTokens = parseInputTokenCount(
      await postJson(OPENAI_INPUT_TOKENS_URL, countBody, apiKey, "token count", fetcher),
    );
    enforceTokenBudget(inputTokens, budget);

    const reply = extractReply(
      await postJson(OPENAI_RESPONSES_URL, body, apiKey, "generation", fetcher),
    );
    return { ...reply, countedInputTokens: inputTokens };
  };
}
