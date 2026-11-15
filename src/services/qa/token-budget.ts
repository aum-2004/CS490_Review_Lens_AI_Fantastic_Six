import "server-only";

import {
  QA_MAX_REQUEST_TOKENS,
  QA_RESERVED_OUTPUT_TOKENS,
  QaPromptError,
} from "@/services/qa/system-prompt";

/**
 * S2-011: request budget, enforced before the generation call.
 *
 * The authoritative input size is OpenAI's own count: POST /v1/responses/input_tokens with the
 * same model, instructions, input, and structured-output format as the generation request. Per
 * the official token-counting guide, that count "includes formatting tokens used to represent
 * request structure, such as message roles and boundaries", so no local overhead allowance is
 * needed. Generation is allowed only if input_tokens + QA_RESERVED_OUTPUT_TOKENS <=
 * QA_MAX_REQUEST_TOKENS (16,000 by default). Any counting failure fails closed.
 */

/**
 * Hard ceiling checked before any network call, so an absurdly large request is never sent to the
 * provider, even for counting. 128 KiB is about 4× S2-010's 32 KiB evidence limit plus the prompt;
 * a request this large would need more than 9 bytes per token to fit 14,500 tokens, far above
 * real review text. Exceeding it is treated as REQUEST_TOO_LARGE (fails closed).
 */
export const MAX_COUNTABLE_REQUEST_BYTES = 131_072;

export interface QaTokenBudget {
  maxRequestTokens: number;
  reservedOutputTokens: number;
}

export const QA_TOKEN_BUDGET: QaTokenBudget = {
  maxRequestTokens: QA_MAX_REQUEST_TOKENS,
  reservedOutputTokens: QA_RESERVED_OUTPUT_TOKENS,
};

/** The token count could not be trusted. The generation request is never sent. */
export class QaBudgetError extends Error {
  /** @param detail Operator-facing explanation for server logs; never shown to users. */
  constructor(
    readonly code: "BUDGET_CHECK_FAILED",
    readonly detail: string,
  ) {
    super("We couldn't check the size of this question. Please try again.");
    this.name = "QaBudgetError";
  }
}

function tooLarge(): QaPromptError {
  return new QaPromptError(
    "REQUEST_TOO_LARGE",
    "This question is too long to analyze with these reviews. Try a shorter question.",
  );
}

/** Rejects a request whose serialized payload exceeds MAX_COUNTABLE_REQUEST_BYTES. */
export function assertCountableSize(payload: unknown): void {
  const bytes = Buffer.byteLength(JSON.stringify(payload), "utf8");
  if (bytes > MAX_COUNTABLE_REQUEST_BYTES) throw tooLarge();
}

/**
 * Reads `{"object": "response.input_tokens", "input_tokens": <integer>}` strictly. Anything else
 * (wrong object type, missing, negative, fractional, non-numeric, or unsafe counts) fails closed.
 */
export function parseInputTokenCount(body: unknown): number {
  const count =
    typeof body === "object" && body !== null && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : undefined;
  if (count?.object !== "response.input_tokens") {
    throw new QaBudgetError("BUDGET_CHECK_FAILED", "Token count response had an unexpected shape.");
  }
  const tokens = count.input_tokens;
  if (typeof tokens !== "number" || !Number.isSafeInteger(tokens) || tokens < 0) {
    throw new QaBudgetError("BUDGET_CHECK_FAILED", "Token count response had an invalid count.");
  }
  return tokens;
}

/** Throws REQUEST_TOO_LARGE unless inputTokens + reserved output fits the cap. */
export function enforceTokenBudget(
  inputTokens: number,
  budget: QaTokenBudget = QA_TOKEN_BUDGET,
): void {
  if (inputTokens + budget.reservedOutputTokens > budget.maxRequestTokens) throw tooLarge();
}
