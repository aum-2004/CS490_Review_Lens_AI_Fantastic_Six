import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * S3-006: persisted Q&A history of an analysis.
 *
 * Each exchange is the question the user asked and the response ReviewLens showed, stored on the
 * analysis it belongs to (S3-BR-009, S3-BR-010). Writes go through `record_review_qa_exchange`,
 * which checks that the session user owns the target and that every cited review belongs to it.
 * Reads go through RLS and are also filtered by target, so one analysis never shows another's
 * history (S3-BR-013).
 *
 * `client` must be the cookie-scoped session client, never a service-role client, so the
 * database applies the same ownership checks as the route.
 */

/** The public outcomes the questions API returns and history stores. */
export const QA_HISTORY_OUTCOMES = ["answered", "insufficient_evidence", "out_of_scope"] as const;
export type QaHistoryOutcome = (typeof QA_HISTORY_OUTCOMES)[number];

/** Same value as the database cap in record_review_qa_exchange. */
export const MAX_QA_HISTORY_EXCHANGES = 200;

export interface QaExchangeInput {
  targetId: string;
  question: string;
  outcome: QaHistoryOutcome;
  answer: string;
  /** Already validated against the target's evidence by parseQaModelReply. */
  citedReviewIds: readonly string[];
  promptVersion: string;
}

export interface QaHistoryExchange {
  id: string;
  question: string;
  outcome: QaHistoryOutcome;
  answer: string;
  citedReviewIds: string[];
  createdAt: string;
}

export type QaHistoryErrorCode = "QA_HISTORY_FULL" | "QA_HISTORY_UNAVAILABLE";

const ERROR_MESSAGES: Record<QaHistoryErrorCode, string> = {
  QA_HISTORY_FULL: "This analysis has reached its Q&A history limit.",
  QA_HISTORY_UNAVAILABLE: "Q&A history is temporarily unavailable. Please try again later.",
};

/** The message never includes questions, answers or database details. */
export class QaHistoryError extends Error {
  constructor(readonly code: QaHistoryErrorCode) {
    super(ERROR_MESSAGES[code]);
    this.name = "QaHistoryError";
  }
}

type ExchangeRow = {
  id: unknown;
  question: unknown;
  outcome: unknown;
  answer: unknown;
  cited_review_ids: unknown;
  created_at: unknown;
};

function isOutcome(value: unknown): value is QaHistoryOutcome {
  return QA_HISTORY_OUTCOMES.includes(value as QaHistoryOutcome);
}

function toExchange(row: ExchangeRow): QaHistoryExchange {
  if (
    typeof row.id !== "string" ||
    typeof row.question !== "string" ||
    !isOutcome(row.outcome) ||
    typeof row.answer !== "string" ||
    !Array.isArray(row.cited_review_ids) ||
    !row.cited_review_ids.every((id) => typeof id === "string") ||
    typeof row.created_at !== "string"
  ) {
    throw new QaHistoryError("QA_HISTORY_UNAVAILABLE");
  }
  return {
    id: row.id,
    question: row.question,
    outcome: row.outcome,
    answer: row.answer,
    citedReviewIds: [...row.cited_review_ids],
    createdAt: row.created_at,
  };
}

/** Saves one exchange and returns its identity. Throws QaHistoryError on any failure. */
export async function recordQaExchange(
  client: SupabaseClient,
  exchange: QaExchangeInput,
): Promise<{ id: string; createdAt: string }> {
  const { data, error } = await client.rpc("record_review_qa_exchange", {
    p_target_id: exchange.targetId,
    p_question: exchange.question,
    p_outcome: exchange.outcome,
    p_answer: exchange.answer,
    p_prompt_version: exchange.promptVersion,
    p_cited_review_ids: [...exchange.citedReviewIds],
  });
  if (error?.code === "P0001" && error.message === "QA_HISTORY_FULL") {
    throw new QaHistoryError("QA_HISTORY_FULL");
  }
  const row: unknown = Array.isArray(data) ? data[0] : null;
  if (
    error ||
    typeof row !== "object" ||
    row === null ||
    !("id" in row) ||
    typeof row.id !== "string" ||
    !("created_at" in row) ||
    typeof row.created_at !== "string"
  ) {
    throw new QaHistoryError("QA_HISTORY_UNAVAILABLE");
  }
  return { id: row.id, createdAt: row.created_at };
}

/**
 * The target's history, oldest first. The caller must already have confirmed the session user
 * owns `targetId`; RLS enforces it again.
 */
export async function listQaHistory(
  client: SupabaseClient,
  targetId: string,
): Promise<QaHistoryExchange[]> {
  const { data, error } = await client
    .from("review_qa_exchanges")
    .select("id, question, outcome, answer, cited_review_ids, created_at")
    .eq("analysis_target_id", targetId)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(MAX_QA_HISTORY_EXCHANGES);
  if (error || !Array.isArray(data)) throw new QaHistoryError("QA_HISTORY_UNAVAILABLE");
  return (data as ExchangeRow[]).map(toExchange);
}
