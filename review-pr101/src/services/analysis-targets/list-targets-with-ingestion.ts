import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { listAnalysisTargets, type AnalysisTargetListItem } from "./list-analysis-targets";
import { getTargetIngestionSummaries } from "@/services/ingestion/ingestion-attempt-repository";
import type { IngestionSummary } from "@/services/ingestion/ingestion-state";

export type TargetWithIngestion = AnalysisTargetListItem & { ingestion: IngestionSummary | null };
/** Preserve target visibility on a status outage, but never call missing status 'Not ingested'. */
export async function listTargetsWithIngestion(
  client: SupabaseClient,
  ownerId: string,
): Promise<TargetWithIngestion[]> {
  const targets = await listAnalysisTargets(client, ownerId);
  try {
    const summaries = await getTargetIngestionSummaries(
      client,
      ownerId,
      targets.map((target) => target.id),
    );
    return targets.map((target) => ({ ...target, ingestion: summaries.get(target.id) ?? null }));
  } catch {
    console.error("Ingestion status operation failed", {
      operation: "list-status",
      category: "LOAD_FAILED",
    });
    return targets.map((target) => ({ ...target, ingestion: null }));
  }
}
