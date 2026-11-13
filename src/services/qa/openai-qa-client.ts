import "server-only";

import type { QaModelCaller, QaModelReply } from "@/services/qa/answer-question";
import { QA_REPLY_JSON_SCHEMA } from "@/services/qa/qa-response";
import type { QaModelRequest } from "@/services/qa/system-prompt";

/**
 * S2-011: OpenAI Responses API adapter (POST /v1/responses), called with fetch so no SDK
 * dependency is added. Checked against the official API reference on 2026-11-12; see
 * docs/s2-011-answers.md for which response fields were confirmed.
 */
const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
export const OPENAI_TIMEOUT_MS = 30_000;
/** A Q&A reply is small; never buffer more than this from the provider. */
export const MAX_OPENAI_RESPONSE_BYTES = 262_144;

export type QaModelErrorCode =
  | "QA_DISABLED"
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
  constructor(readonly code: QaModelErrorCode) {
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
  if (env.QA_ENABLED !== "true") throw new QaModelError("QA_DISABLED");
  const apiKey = env.OPENAI_API_KEY?.trim();
  const model = env.OPENAI_QA_MODEL?.trim();
  if (!apiKey || !model) throw new QaModelError("MODEL_NOT_CONFIGURED");
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

function errorForStatus(status: number): QaModelError {
  if (status === 429) return new QaModelError("MODEL_RATE_LIMITED");
  if (status === 401 || status === 403) return new QaModelError("MODEL_AUTH");
  if (status >= 400 && status < 500 && status !== 408) return new QaModelError("MODEL_REJECTED");
  return new QaModelError("MODEL_UNAVAILABLE");
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

export interface OpenAiQaModelOptions {
  fetcher?: typeof fetch;
  env?: QaEnv;
}

/**
 * Production QaModelCaller. Configuration is read on every call, so turning QA_ENABLED off takes
 * effect without a restart and a missing key fails closed before any network request.
 */
export function createOpenAiQaModel({ fetcher, env }: OpenAiQaModelOptions = {}): QaModelCaller {
  return async (request) => {
    const { apiKey, model } = readOpenAiQaConfig(env);

    let response: Response;
    try {
      response = await (fetcher ?? fetch)(OPENAI_RESPONSES_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(buildOpenAiRequestBody(request, model)),
        cache: "no-store",
        signal: AbortSignal.timeout(OPENAI_TIMEOUT_MS),
      });
    } catch (error) {
      throw new QaModelError(isTimeoutError(error) ? "MODEL_TIMEOUT" : "MODEL_UNAVAILABLE");
    }

    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      throw errorForStatus(response.status);
    }
    return extractReply(await readBoundedJson(response));
  };
}
