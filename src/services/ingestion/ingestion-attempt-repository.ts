import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NO_INGESTION, type IngestionSummary, type IdentityBasis } from "./ingestion-state";
import type { VerifiedBusinessIdentity } from "./outscraper-client";

export interface IngestionAttemptRow {
  id: string;
  analysis_target_id: string;
  owner_id: string;
  source_url: string;
  submitted_query: string;
  query_kind: "place_id" | "source_url";
  expected_place_id: string | null;
  provider_request_id: string | null;
  status: "processing" | "succeeded" | "failed";
  started_at: string;
  finished_at: string | null;
  saved_count: number;
  skipped_count: number;
  error_code: string | null;
  identity_basis: IdentityBasis | null;
  verified_identity: VerifiedBusinessIdentity | null;
}
const COLUMNS =
  "id, analysis_target_id, owner_id, source_url, submitted_query, query_kind, expected_place_id, provider_request_id, status, started_at, finished_at, saved_count, skipped_count, error_code, identity_basis, verified_identity";
export class IngestionPersistenceError extends Error {
  readonly code = "INGESTION_STORAGE_FAILED";
  constructor() {
    super("We couldn't load or save the ingestion result. Please try again.");
  }
}
export function summarizeAttempt(row: IngestionAttemptRow | null): IngestionSummary {
  return row
    ? {
        state: row.status,
        startedAt: row.started_at,
        finishedAt: row.finished_at,
        savedCount: row.saved_count,
        skippedCount: row.skipped_count,
        errorCode: row.error_code,
        identityBasis: row.identity_basis ?? null,
        providerBusinessName: row.verified_identity?.businessName ?? null,
      }
    : { ...NO_INGESTION };
}
export async function getLatestAttempt(client: SupabaseClient, ownerId: string, targetId: string) {
  const { data, error } = await client
    .from("latest_ingestion_attempts")
    .select(COLUMNS)
    .eq("owner_id", ownerId)
    .eq("analysis_target_id", targetId)
    .maybeSingle<IngestionAttemptRow>();
  if (error) throw new IngestionPersistenceError();
  return data;
}
export async function getBoundAttempt(
  client: SupabaseClient,
  ownerId: string,
  targetId: string,
  jobId: string,
) {
  const { data, error } = await client
    .from("ingestion_attempts")
    .select(COLUMNS)
    .eq("owner_id", ownerId)
    .eq("analysis_target_id", targetId)
    .eq("provider_request_id", jobId)
    .maybeSingle<IngestionAttemptRow>();
  if (error || !data) throw new IngestionPersistenceError();
  return data;
}
/** The view explicitly confirms no attempt. Missing response rows never imply no ingestion. */
export async function getTargetIngestionSummaries(
  client: SupabaseClient,
  ownerId: string,
  targetIds: string[],
) {
  if (!ownerId) throw new IngestionPersistenceError();
  if (!targetIds.length) return new Map<string, IngestionSummary>();
  const { data, error } = await client
    .from("analysis_target_ingestion_status")
    .select(
      "analysis_target_id, owner_id, state, started_at, finished_at, saved_count, skipped_count, error_code, identity_basis, provider_business_name",
    )
    .eq("owner_id", ownerId)
    .in("analysis_target_id", targetIds)
    .limit(targetIds.length);
  if (error || !data) throw new IngestionPersistenceError();
  const summaries = new Map<string, IngestionSummary>();
  for (const row of data as Array<
    Pick<
      IngestionAttemptRow,
      | "analysis_target_id"
      | "owner_id"
      | "started_at"
      | "finished_at"
      | "saved_count"
      | "skipped_count"
      | "error_code"
    > & {
      state: IngestionSummary["state"];
      identity_basis: IdentityBasis | null;
      provider_business_name: string | null;
    }
  >) {
    if (row.owner_id !== ownerId || !targetIds.includes(row.analysis_target_id))
      throw new IngestionPersistenceError();
    summaries.set(row.analysis_target_id, {
      state: row.state,
      startedAt: row.started_at,
      finishedAt: row.finished_at,
      savedCount: row.saved_count,
      skippedCount: row.skipped_count,
      errorCode: row.error_code,
      identityBasis: row.identity_basis ?? null,
      providerBusinessName: row.provider_business_name ?? null,
    });
  }
  return summaries;
}
export function createIngestionAttemptWriter(admin: SupabaseClient) {
  async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
    const { data, error } = await admin.rpc(name, args);
    if (error || !data) throw new IngestionPersistenceError();
    return data as T;
  }
  return {
    findForRecovery: async (attemptId: string) => {
      const { data, error } = await admin
        .from("ingestion_attempts")
        .select(COLUMNS)
        .eq("id", attemptId)
        .maybeSingle<IngestionAttemptRow>();
      if (error) throw new IngestionPersistenceError();
      return data;
    },
    reserve: (targetId: string, ownerId: string) =>
      rpc<{ attempt: IngestionAttemptRow; created: boolean }>("reserve_ingestion_attempt", {
        p_target_id: targetId,
        p_owner_id: ownerId,
      }),
    bind: (attemptId: string, ownerId: string, jobId: string) =>
      rpc<IngestionAttemptRow>("bind_ingestion_job", {
        p_attempt_id: attemptId,
        p_owner_id: ownerId,
        p_request_id: jobId,
      }),
    expireUnbound: (attemptId: string, ownerId: string) =>
      rpc<IngestionAttemptRow>("expire_unbound_ingestion_attempt", {
        p_attempt_id: attemptId,
        p_owner_id: ownerId,
      }),
    expireBound: (attemptId: string, ownerId: string) =>
      rpc<IngestionAttemptRow>("expire_bound_ingestion_attempt", {
        p_attempt_id: attemptId,
        p_owner_id: ownerId,
      }),
    finish: (
      attemptId: string,
      ownerId: string,
      reviews: Record<string, unknown>[],
      skippedCount: number,
      identity: VerifiedBusinessIdentity | null,
      errorCode: string | null,
    ) =>
      rpc<IngestionAttemptRow>("finish_ingestion_attempt", {
        p_attempt_id: attemptId,
        p_owner_id: ownerId,
        p_reviews: reviews,
        p_skipped_count: skippedCount,
        p_identity: identity,
        p_error_code: errorCode,
      }),
  };
}
