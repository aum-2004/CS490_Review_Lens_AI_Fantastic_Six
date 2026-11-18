import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { AnalysisTargetPersistenceError, type AnalysisTarget } from "./analysis-target-repository";
import { MAX_TARGETS } from "./list-limits";

export type AnalysisTargetListItem = Pick<
  AnalysisTarget,
  "id" | "name" | "platform" | "sourceUrl" | "createdAt"
>;

type TargetListRow = {
  id: string;
  name: string;
  platform: AnalysisTarget["platform"];
  source_url: string;
  created_at: string;
};

/**
 * ownerId must be the server-verified session user. Pass a session-scoped client,
 * never a service-role client. Ownership is constrained in EVERY database query.
 */
export async function listAnalysisTargets(
  client: SupabaseClient,
  ownerId: string,
): Promise<AnalysisTargetListItem[]> {
  if (!ownerId) throw new AnalysisTargetPersistenceError("list");
  const { data, error } = await client
    .from("analysis_targets")
    .select("id, name, platform, source_url, created_at")
    .eq("owner_id", ownerId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(MAX_TARGETS);

  if (error || !data) {
    throw new AnalysisTargetPersistenceError("list", { cause: error });
  }

  return (data as TargetListRow[]).map((row) => ({
    id: row.id,
    name: row.name,
    platform: row.platform,
    sourceUrl: row.source_url,
    createdAt: row.created_at,
  }));
}
