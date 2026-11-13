import "server-only";

import { isWithinTokenLimit } from "gpt-tokenizer";

import {
  QA_MAX_REQUEST_TOKENS,
  QA_RESERVED_OUTPUT_TOKENS,
  QaPromptError,
} from "@/services/qa/system-prompt";

/**
 * S2-011: model-aware request budget, enforced immediately before the provider call.
 *
 * Counted input = tokens(instructions) + tokens(input) + tokens(JSON of the structured-output
 * format) + QA_MODEL_OVERHEAD_TOKENS. The request may be sent only if
 * counted input + QA_RESERVED_OUTPUT_TOKENS <= QA_MAX_REQUEST_TOKENS (16,000 by default).
 *
 * Tokens are counted with gpt-tokenizer's `o200k_base`, the encoding its documentation lists for
 * the GPT-5, GPT-4.1, GPT-4o, and o-series model families. Any other model fails safely: no
 * provider call is made until its encoding is confirmed and added to QA_MODEL_ENCODINGS.
 */

/** Model families whose tokenizer is `o200k_base` (gpt-tokenizer 4.1.0 documentation). */
export const QA_MODEL_ENCODINGS: ReadonlyArray<{ pattern: RegExp; encoding: "o200k_base" }> = [
  { pattern: /^gpt-5(?:[.-]|$)/, encoding: "o200k_base" },
  { pattern: /^gpt-4\.1(?:-|$)/, encoding: "o200k_base" },
  { pattern: /^gpt-4o(?:-|$)/, encoding: "o200k_base" },
  { pattern: /^o[134](?:-|$)/, encoding: "o200k_base" },
];

/**
 * Allowance for tokens the provider adds that are not in the request text: message framing
 * (role and separator tokens for the system and user messages, and reply priming, a few tokens
 * each) and the formatting the provider wraps around the structured-output schema. The schema
 * JSON itself is counted exactly. OpenAI does not publish the exact framing, so this is a
 * deliberately generous allowance; check it against `usage.input_tokens` in the smoke test.
 */
export const QA_MODEL_OVERHEAD_TOKENS = 256;

/** Review text is untrusted: count special-token strings like "<|endoftext|>" as plain text. */
const COUNT_OPTIONS = { disallowedSpecial: new Set<string>() };

export class QaBudgetError extends Error {
  /** @param detail Operator-facing explanation for server logs; never shown to users. */
  constructor(
    readonly code: "MODEL_BUDGET_UNSUPPORTED" | "BUDGET_CHECK_FAILED",
    readonly detail: string,
  ) {
    super("Review Q&A is not available for this configuration.");
    this.name = "QaBudgetError";
  }
}

export function resolveTokenEncoding(model: string): "o200k_base" {
  const match = QA_MODEL_ENCODINGS.find(({ pattern }) => pattern.test(model));
  if (!match) {
    throw new QaBudgetError(
      "MODEL_BUDGET_UNSUPPORTED",
      `No token encoding is registered for OPENAI_QA_MODEL="${model}". Confirm its tokenizer and ` +
        "add it to QA_MODEL_ENCODINGS before enabling Q&A with this model.",
    );
  }
  return match.encoding;
}

/** Every piece of text the provider turns into input tokens. */
export interface ModelInputParts {
  instructions: string;
  input: string;
  /** The exact structured-output format object sent to the provider. */
  responseFormat: unknown;
}

export interface QaTokenBudget {
  maxRequestTokens: number;
  reservedOutputTokens: number;
}

export const QA_TOKEN_BUDGET: QaTokenBudget = {
  maxRequestTokens: QA_MAX_REQUEST_TOKENS,
  reservedOutputTokens: QA_RESERVED_OUTPUT_TOKENS,
};

/**
 * Counts the model input against the budget. Returns the counted input tokens, or throws:
 * QaPromptError("REQUEST_TOO_LARGE") when over budget, QaBudgetError when the model is unsupported
 * or counting fails. Counting stops early once a part exceeds what remains, so an oversized
 * question is never fully tokenized.
 */
export function enforceModelInputBudget(
  parts: ModelInputParts,
  model: string,
  budget: QaTokenBudget = QA_TOKEN_BUDGET,
): number {
  resolveTokenEncoding(model);

  const texts = [parts.instructions, parts.input, JSON.stringify(parts.responseFormat)];
  let remaining = budget.maxRequestTokens - budget.reservedOutputTokens - QA_MODEL_OVERHEAD_TOKENS;
  let counted = QA_MODEL_OVERHEAD_TOKENS;

  for (const text of texts) {
    let tokens: number | false;
    try {
      tokens = remaining < 0 ? false : isWithinTokenLimit(text, remaining, COUNT_OPTIONS);
    } catch {
      throw new QaBudgetError(
        "BUDGET_CHECK_FAILED",
        "The request could not be tokenized; it was not sent.",
      );
    }
    if (tokens === false) {
      throw new QaPromptError(
        "REQUEST_TOO_LARGE",
        "This question is too long to analyze with these reviews. Try a shorter question.",
      );
    }
    remaining -= tokens;
    counted += tokens;
  }
  return counted;
}
