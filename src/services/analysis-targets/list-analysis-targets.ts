import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { AnalysisTargetPersistenceError, type AnalysisTarget } from "./analysis-target-repository";

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

const PAGE_SIZE = 1000;

/**
 * ownerId must be the server-verified session user. Pass a session-scoped client,
 * never a service-role client. Ownership is constrained in EVERY database query.
 */
export async function listAnalysisTargets(
  client: SupabaseClient,
  ownerId: string,
): Promise<AnalysisTargetListItem[]> {
  if (!ownerId) throw new AnalysisTargetPersistenceError("list");
  const rows: TargetListRow[] = [];

  while (true) {
    const { data, error } = await client
      .from("analysis_targets")
      .select("id, name, platform, source_url, created_at")
      .eq("owner_id", ownerId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(rows.length, rows.length + PAGE_SIZE - 1);

    if (error || !data) {
      throw new AnalysisTargetPersistenceError("list", { cause: error });
    }
    if (data.length === 0) break;
    rows.push(...(data as TargetListRow[]));
  }

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    platform: row.platform,
    sourceUrl: row.source_url,
    createdAt: row.created_at,
  }));
}
