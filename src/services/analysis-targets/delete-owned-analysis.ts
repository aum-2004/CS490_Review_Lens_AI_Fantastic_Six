import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { TargetNotFoundError } from "./target-ownership";

export class AnalysisDeletionError extends Error {
  readonly code = "ANALYSIS_DELETE_FAILED";
  constructor() {
    super("We couldn't delete this analysis. Please try again.");
    this.name = "AnalysisDeletionError";
  }
}

/** Session-scoped client only. The RPC rechecks auth.uid() atomically; no client owner ID. */
export async function deleteOwnedAnalysis(client: SupabaseClient, targetId: string): Promise<void> {
  let result: { data: unknown; error: unknown };
  try {
    result = await client.rpc("delete_owned_analysis", { p_target_id: targetId });
  } catch {
    throw new AnalysisDeletionError();
  }
  if (result.error || (result.data !== true && result.data !== false)) {
    throw new AnalysisDeletionError();
  }
  if (!result.data) throw new TargetNotFoundError();
}
