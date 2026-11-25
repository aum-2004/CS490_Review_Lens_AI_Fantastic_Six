import "server-only";
import type { createSupabaseServerClient } from "@/lib/supabase/server";

export const MAX_QUESTIONS_PER_24_HOURS = 30;

export class QuestionQuotaError extends Error {
  constructor(readonly code: "QA_DAILY_LIMIT" | "QA_QUOTA_UNAVAILABLE") {
    super(
      code === "QA_DAILY_LIMIT"
        ? `You've reached the limit of ${MAX_QUESTIONS_PER_24_HOURS} questions in 24 hours. Please try again later.`
        : "Question limits are temporarily unavailable. Please try again later.",
    );
    this.name = "QuestionQuotaError";
  }
}

/** The RPC atomically reserves the cookie session's account-wide slot, never a browser owner ID. */
export async function reserveQuestionQuota(
  client: Awaited<ReturnType<typeof createSupabaseServerClient>>,
) {
  try {
    const { data, error } = await client.rpc("reserve_review_question");
    if (error?.code === "P0001" && error.message === "QA_DAILY_LIMIT") {
      throw new QuestionQuotaError("QA_DAILY_LIMIT");
    }
    if (error || !Number.isInteger(data) || data < 0 || data >= MAX_QUESTIONS_PER_24_HOURS) {
      throw new QuestionQuotaError("QA_QUOTA_UNAVAILABLE");
    }
  } catch (error) {
    if (error instanceof QuestionQuotaError) throw error;
    throw new QuestionQuotaError("QA_QUOTA_UNAVAILABLE");
  }
}
