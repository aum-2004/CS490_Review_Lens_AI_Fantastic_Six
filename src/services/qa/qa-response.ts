import "server-only";

import { z } from "zod";

import {
  QA_DECLINE_PRIORITY,
  QA_OUTCOMES,
  type QaModelRequest,
  type QaOutcome,
} from "@/services/qa/system-prompt";

/**
 * S2-011 / S2-012: validates the model's reply before anything reaches the user.
 *
 * The prompt (S2-013) asks for `{"outcome", "answer", "citedReviewIds"}`. The model can still
 * return malformed JSON, unknown outcomes, or invented review IDs, so every reply is checked
 * here and rejected (fail closed) rather than repaired.
 */

/** Longest answer shown to the user. Well above what QA_RESERVED_OUTPUT_TOKENS can produce. */
export const MAX_ANSWER_CHARACTERS = 8_000;

/** JSON schema sent to the provider as structured output. Mirrors `modelReplySchema`. */
export const QA_REPLY_JSON_SCHEMA = {
  type: "object",
  properties: {
    outcome: { type: "string", enum: [...QA_OUTCOMES] },
    answer: { type: "string" },
    citedReviewIds: { type: "array", items: { type: "string" } },
  },
  required: ["outcome", "answer", "citedReviewIds"],
  additionalProperties: false,
} as const;

const modelReplySchema = z
  .object({
    outcome: z.enum(QA_OUTCOMES),
    answer: z.string().trim().min(1).max(MAX_ANSWER_CHARACTERS),
    citedReviewIds: z.array(z.string()).max(1_000),
  })
  .strict();

/** A validated reply, safe to show to the user. */
export interface QaAnswer {
  outcome: QaOutcome;
  answer: string;
  /** Review IDs that support the answer; always a subset of the request's `reviewIds`. */
  citedReviewIds: string[];
  promptVersion: string;
  targetId: string;
}

export type QaResponseErrorCode = "INVALID_MODEL_RESPONSE" | "UNGROUNDED_ANSWER";

const RESPONSE_ERROR_MESSAGE = "We couldn't produce a reliable answer. Please try again.";

/** The reply cannot be shown. The message never includes model output or review text. */
export class QaResponseError extends Error {
  constructor(readonly code: QaResponseErrorCode) {
    super(RESPONSE_ERROR_MESSAGE);
    this.name = "QaResponseError";
  }
}

const DECLINE_OUTCOMES: ReadonlySet<QaOutcome> = new Set(QA_DECLINE_PRIORITY);

export function parseQaModelReply(replyText: string, request: QaModelRequest): QaAnswer {
  let json: unknown;
  try {
    json = JSON.parse(replyText);
  } catch {
    throw new QaResponseError("INVALID_MODEL_RESPONSE");
  }

  const parsed = modelReplySchema.safeParse(json);
  if (!parsed.success) throw new QaResponseError("INVALID_MODEL_RESPONSE");
  const { outcome, answer } = parsed.data;

  // An ID the request did not contain means the model invented or mixed in evidence.
  const allowed = new Set(request.reviewIds);
  if (parsed.data.citedReviewIds.some((id) => !allowed.has(id))) {
    throw new QaResponseError("UNGROUNDED_ANSWER");
  }
  const cited = [...new Set(parsed.data.citedReviewIds)];

  // S2-011: an answer must be connected to at least one supplied review.
  if (outcome === "answered" && cited.length === 0) {
    throw new QaResponseError("UNGROUNDED_ANSWER");
  }

  return {
    outcome,
    answer,
    // A decline is not an answer from the reviews, so it never shows supporting evidence.
    // insufficient_evidence may cite reviews for the part it could answer (prompt rule 4).
    citedReviewIds: DECLINE_OUTCOMES.has(outcome) ? [] : cited,
    promptVersion: request.promptVersion,
    targetId: request.targetId,
  };
}
