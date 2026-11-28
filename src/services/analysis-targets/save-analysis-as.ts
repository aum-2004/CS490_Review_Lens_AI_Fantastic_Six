import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { TargetNotFoundError } from "./target-ownership";

/**
 * S3-003: copy an owned analysis under a new name (S3-BR-005, S3-BR-006).
 *
 * The `save_analysis_as` RPC derives the owner from the session, copies the analysis, its reviews
 * and its last successful ingestion summary, and returns the new analysis id. Q&A history is not
 * copied. `client` must be the cookie-scoped session client.
 */
export type SaveAnalysisAsErrorCode = "ANALYSIS_LIMIT" | "SAVE_AS_FAILED";

const MESSAGES: Record<SaveAnalysisAsErrorCode, string> = {
  ANALYSIS_LIMIT:
    "You've reached the limit of 200 analyses. Delete an analysis before saving another copy.",
  SAVE_AS_FAILED: "We couldn't save a copy of this analysis. Please try again.",
};

export class SaveAnalysisAsError extends Error {
  constructor(readonly code: SaveAnalysisAsErrorCode) {
    super(MESSAGES[code]);
    this.name = "SaveAnalysisAsError";
  }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Returns the new analysis id. Throws TargetNotFoundError or SaveAnalysisAsError. */
export async function saveAnalysisAs(
  client: SupabaseClient,
  sourceTargetId: string,
  name: string,
): Promise<string> {
  let result: { data: unknown; error: { code?: string; message?: string } | null };
  try {
    result = await client.rpc("save_analysis_as", {
      p_source_target_id: sourceTargetId,
      p_name: name,
    });
  } catch {
    throw new SaveAnalysisAsError("SAVE_AS_FAILED");
  }
  const { data, error } = result;
  if (error?.code === "P0002") throw new TargetNotFoundError();
  if (error?.code === "P0001" && error.message === "ANALYSIS_LIMIT") {
    throw new SaveAnalysisAsError("ANALYSIS_LIMIT");
  }
  if (error || typeof data !== "string" || !UUID_PATTERN.test(data)) {
    throw new SaveAnalysisAsError("SAVE_AS_FAILED");
  }
  return data;
}
