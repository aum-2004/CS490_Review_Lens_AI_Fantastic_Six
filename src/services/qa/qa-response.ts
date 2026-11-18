import "server-only";

import { z } from "zod";

import {
  MAX_CLAIM_STATEMENT_CHARACTERS,
  QA_COVERAGE,
  QA_OUTCOMES,
  REVIEW_PLATFORM_LABELS,
  type PromptReview,
  type PromptTarget,
  type QaModelRequest,
  type QaOutcome,
} from "@/services/qa/system-prompt";

export { MAX_CLAIM_STATEMENT_CHARACTERS };

/**
 * S2-011 / S2-012: validates the model's reply before anything reaches the user.
 *
 * The prompt (S2-013) asks for `{"outcome", "claims", "coverage"}`:
 *   - `claims` holds every finding from the reviews. Each claim cites one or more reviews, and each
 *     citation carries a quote that must be one contiguous span of THAT review's text.
 *   - `coverage` is a closed enum (complete | partial | none). The model writes no other text: the
 *     server owns every word shown for a decline, insufficient evidence, or a partial answer.
 *
 * A valid review ID is not proof that a claim is grounded, so each quote is checked against the
 * cited review's persisted text, and the quote is shown next to its statement so a mismatch is
 * visible to the reader. The reply is rejected (fail closed) rather than repaired: dropping one bad
 * claim would silently change the meaning of the rest.
 */

/** Longest answer shown to the user. Well above what QA_RESERVED_OUTPUT_TOKENS can produce. */
export const MAX_ANSWER_CHARACTERS = 8_000;
export const MAX_CLAIMS = 20;
export const MAX_EVIDENCE_PER_CLAIM = 10;
export const MAX_QUOTE_CHARACTERS = 500;
/** A shorter quote (such as "the") would match almost any review and prove nothing. */
export const MIN_QUOTE_WORDS = 3;
/**
 * A statement sharing this many consecutive words with the system prompt is treated as a prompt
 * echo. Ordinary findings about reviews do not repeat eight words of the rules verbatim.
 */
export const PROMPT_ECHO_MIN_WORDS = 8;

/** Server-written line appended to a partial answer (S2-012). */
export const PARTIAL_COVERAGE_TEXT = "Parts of your question are not covered by these reviews.";

type NonAnswerOutcome = Exclude<QaOutcome, "answered">;

/**
 * The whole answer for every outcome other than "answered". Written by the server, never by the
 * model. `platform` is the trusted label from REVIEW_PLATFORM_LABELS, not model or user text.
 */
export function nonAnswerText(outcome: NonAnswerOutcome, platform: string): string {
  switch (outcome) {
    case "insufficient_evidence":
      return "These reviews don't contain enough information to answer that question.";
    case "declined_general_knowledge":
      return `I can only answer questions about the ${platform} reviews for this target. Try asking what reviewers say about its service, quality, or prices.`;
    case "declined_other_entity":
      return `I can only analyze the ${platform} reviews for this target, not other businesses or comparisons with them. Try asking what reviewers say about this target.`;
    case "declined_other_platform":
      return `I can only analyze the ${platform} reviews for this target, not reviews from other platforms. Try asking what these reviews say.`;
  }
}

/**
 * JSON schema sent to the provider as structured output. Mirrors `modelReplySchema`. Strict-mode
 * compatible: every object lists all of its properties as required and sets
 * `additionalProperties: false`, and nothing is nullable. Length and count limits are enforced by
 * `modelReplySchema`, not by the provider.
 */
export const QA_REPLY_JSON_SCHEMA = {
  type: "object",
  properties: {
    outcome: { type: "string", enum: [...QA_OUTCOMES] },
    claims: {
      type: "array",
      items: {
        type: "object",
        properties: {
          statement: { type: "string" },
          evidence: {
            type: "array",
            items: {
              type: "object",
              properties: {
                reviewId: { type: "string" },
                quote: { type: "string" },
              },
              required: ["reviewId", "quote"],
              additionalProperties: false,
            },
          },
        },
        required: ["statement", "evidence"],
        additionalProperties: false,
      },
    },
    coverage: { type: "string", enum: [...QA_COVERAGE] },
  },
  required: ["outcome", "claims", "coverage"],
  additionalProperties: false,
} as const;

const evidenceSchema = z
  .object({ reviewId: z.string(), quote: z.string().max(MAX_QUOTE_CHARACTERS) })
  .strict();

const claimSchema = z
  .object({
    statement: z.string().trim().min(1).max(MAX_CLAIM_STATEMENT_CHARACTERS),
    evidence: z.array(evidenceSchema).max(MAX_EVIDENCE_PER_CLAIM),
  })
  .strict();

const modelReplySchema = z
  .object({
    outcome: z.enum(QA_OUTCOMES),
    claims: z.array(claimSchema).max(MAX_CLAIMS),
    coverage: z.enum(QA_COVERAGE),
  })
  .strict();

/** A validated reply, safe to show to the user. */
export interface QaAnswer {
  outcome: QaOutcome;
  /**
   * Text shown to the user, always composed by the server. For `answered`: each verified claim's
   * statement, then each of its quotes on an indented line with the cited review ID, then the
   * partial-coverage line if any. Otherwise: the fixed `nonAnswerText` for the outcome.
   */
  answer: string;
  /** Review IDs that support the answer; always a subset of the request's `reviewIds`. */
  citedReviewIds: string[];
  promptVersion: string;
  targetId: string;
}

export type QaResponseErrorCode =
  | "INVALID_MODEL_RESPONSE"
  | "UNGROUNDED_ANSWER"
  | "UNEXPECTED_CITATIONS"
  | "UNSUPPORTED_CLAIM"
  | "PROMPT_ECHO";

const RESPONSE_ERROR_MESSAGE = "We couldn't produce a reliable answer. Please try again.";

/** The reply cannot be shown. The message never includes model output or review text. */
export class QaResponseError extends Error {
  constructor(readonly code: QaResponseErrorCode) {
    super(RESPONSE_ERROR_MESSAGE);
    this.name = "QaResponseError";
  }
}

/** The evidence a reply is checked against: the reviews whose text was sent to the model. */
export type QaEvidenceReview = Pick<PromptReview, "id" | "text">;

/** The authorized context the request was built from (`QaPromptContext` satisfies it). */
export interface QaEvidenceContext {
  target: Pick<PromptTarget, "platform">;
  reviews: readonly QaEvidenceReview[];
}

const SINGLE_QUOTES = /[‘’‚‛′`´]/g;
const DOUBLE_QUOTES = /[“”„‟″«»]/g;
const DASHES = /[‐-―−﹘﹣]/g;

/**
 * Normalization applied identically to quotes and review text: Unicode NFKC (this also turns "…"
 * into "..."), curly quotes and dash variants to their ASCII forms, a per-character case fold
 * (upper then lower, so "ß" matches "SS" and no context rule such as Greek final sigma depends on
 * where a quote starts or ends), and whitespace runs collapsed to one space. Nothing else is
 * removed, so the quote must still be one contiguous span of the review: fragments joined with
 * an ellipsis do not match unless the review itself contains that exact ellipsis.
 */
export function normalizeEvidenceText(text: string): string {
  const unified = text
    .normalize("NFKC")
    .replace(SINGLE_QUOTES, "'")
    .replace(DOUBLE_QUOTES, '"')
    .replace(DASHES, "-");
  return Array.from(unified, (character) => character.toUpperCase().toLowerCase())
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

/** True when `quote` is a contiguous span of `reviewText` that is long enough to mean something. */
export function quoteSupportedByReview(quote: string, reviewText: string): boolean {
  const normalizedQuote = normalizeEvidenceText(quote);
  const normalizedReview = normalizeEvidenceText(reviewText);
  if (normalizedQuote === "") return false;
  const wholeReview = normalizedQuote === normalizedReview;
  if (!wholeReview && normalizedQuote.split(" ").length < MIN_QUOTE_WORDS) return false;
  return normalizedReview.includes(normalizedQuote);
}

/** Letter and digit runs of the normalized text; punctuation and spacing cannot hide an echo. */
function echoWords(text: string): string[] {
  return normalizeEvidenceText(text).match(/[\p{L}\p{N}]+/gu) ?? [];
}

/**
 * True when `statement` repeats at least PROMPT_ECHO_MIN_WORDS consecutive words of
 * `instructions`. A mechanical overlap check against the actual prompt, not a keyword list: it
 * catches a verbatim (or re-punctuated) echo, not a paraphrase.
 */
export function echoesInstructions(statement: string, instructions: string): boolean {
  const words = echoWords(statement);
  const prompt = ` ${echoWords(instructions).join(" ")} `;
  for (let start = 0; start + PROMPT_ECHO_MIN_WORDS <= words.length; start += 1) {
    const window = words.slice(start, start + PROMPT_ECHO_MIN_WORDS).join(" ");
    if (prompt.includes(` ${window} `)) return true;
  }
  return false;
}

/** One line of display text: line breaks and runs of spaces cannot forge extra answer lines. */
function singleLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function parseQaModelReply(
  replyText: string,
  request: QaModelRequest,
  { target, reviews }: QaEvidenceContext,
): QaAnswer {
  let json: unknown;
  try {
    json = JSON.parse(replyText);
  } catch {
    throw new QaResponseError("INVALID_MODEL_RESPONSE");
  }

  const parsed = modelReplySchema.safeParse(json);
  if (!parsed.success) throw new QaResponseError("INVALID_MODEL_RESPONSE");
  const { outcome, claims, coverage } = parsed.data;

  // Only reviews that were both in the request and supplied as evidence can be cited. An ID
  // outside that set means the model invented or mixed in evidence (for any outcome).
  const requested = new Set(request.reviewIds);
  const textById = new Map(
    reviews.filter((review) => requested.has(review.id)).map((review) => [review.id, review.text]),
  );
  const evidence = claims.flatMap((claim) => claim.evidence);
  if (evidence.some((item) => !textById.has(item.reviewId))) {
    throw new QaResponseError("UNGROUNDED_ANSWER");
  }

  if (outcome !== "answered") {
    // Declines and insufficient_evidence are not answers from the reviews, so claims make the
    // reply contradictory. Reject it rather than silently dropping them (prompt: empty list).
    if (claims.length > 0) throw new QaResponseError("UNEXPECTED_CITATIONS");
    // "complete"/"partial" describe an answer; a decline claiming either is contradictory.
    if (coverage !== "none") throw new QaResponseError("INVALID_MODEL_RESPONSE");
    return {
      outcome,
      answer: nonAnswerText(outcome, REVIEW_PLATFORM_LABELS[target.platform]),
      citedReviewIds: [],
      promptVersion: request.promptVersion,
      targetId: request.targetId,
    };
  }

  // S2-011: an answer must contain at least one finding from the reviews.
  if (claims.length === 0) throw new QaResponseError("UNGROUNDED_ANSWER");
  if (coverage === "none") throw new QaResponseError("INVALID_MODEL_RESPONSE");
  for (const claim of claims) {
    if (claim.evidence.length === 0) throw new QaResponseError("UNSUPPORTED_CLAIM");
    for (const item of claim.evidence) {
      // KNOWN LIMITATION: this proves the quote is really in the cited review, not that it
      // entails the statement. A parking claim that quotes a real food sentence passes; showing
      // the quote beside the statement makes that mismatch visible, but does not reject it.
      if (!quoteSupportedByReview(item.quote, textById.get(item.reviewId)!)) {
        throw new QaResponseError("UNSUPPORTED_CLAIM");
      }
    }
    // The server appends the citations. A review ID inside the statement could make model prose
    // look like a cited quote once the UI turns IDs into [1], [2].
    const statement = claim.statement.toLowerCase();
    if (request.reviewIds.some((id) => statement.includes(id.toLowerCase()))) {
      throw new QaResponseError("INVALID_MODEL_RESPONSE");
    }
    // Statements are the only model-written prose shown to the user.
    if (echoesInstructions(claim.statement, request.instructions)) {
      throw new QaResponseError("PROMPT_ECHO");
    }
  }

  const cited: string[] = [];
  const blocks = claims.map((claim) => {
    const lines = [singleLine(claim.statement)];
    for (const item of claim.evidence) {
      if (!cited.includes(item.reviewId)) cited.push(item.reviewId);
      lines.push(`  "${singleLine(item.quote)}" [${item.reviewId}]`);
    }
    return lines.join("\n");
  });
  if (coverage === "partial") blocks.push(PARTIAL_COVERAGE_TEXT);
  const answer = blocks.join("\n\n");
  if (answer.length > MAX_ANSWER_CHARACTERS) throw new QaResponseError("INVALID_MODEL_RESPONSE");

  return {
    outcome,
    answer,
    citedReviewIds: cited,
    promptVersion: request.promptVersion,
    targetId: request.targetId,
  };
}
