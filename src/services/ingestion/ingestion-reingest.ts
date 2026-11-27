import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createIngestionAdminClient } from "@/lib/supabase/ingestion-admin";
import { TargetNotFoundError } from "@/services/analysis-targets/target-ownership";
import {
  IngestionPersistenceError,
  type IngestionAttemptRow,
} from "./ingestion-attempt-repository";
import { beginIngestion, type IngestionDependencies } from "./ingestion-lifecycle";
import { IngestionLimitError } from "./ingestion-limits";
import { ingestionDependencies } from "./ingestion-runtime";
import type { IngestionSummary } from "./ingestion-state";
import {
  isReingestErrorCode,
  reingestErrorMessage,
  type ReingestBaseline,
  type ReingestErrorCode,
} from "./ingestion-reingest-state";

/**
 * S3-009 (S3-BR-014): refresh an existing owned analysis. A refresh reserves a NEW attempt through
 * reserve_reingestion_attempt and then follows the exact initial-collection path: the same gates,
 * the single paid submission, idempotent binding, signed recovery, and the S3-011 merge on
 * completion. Reviews are only ever merged; nothing in this flow removes or deactivates a review.
 */
export class IngestionReingestError extends Error {
  constructor(readonly code: ReingestErrorCode) {
    super(reingestErrorMessage(code));
    this.name = "IngestionReingestError";
  }
}

type Reservation = { attempt: IngestionAttemptRow; created: boolean };

function isReservation(value: unknown): value is Reservation {
  if (!value || typeof value !== "object") return false;
  const { attempt, created } = value as Record<string, unknown>;
  return (
    created === true &&
    !!attempt &&
    typeof attempt === "object" &&
    typeof (attempt as Record<string, unknown>).id === "string"
  );
}

/** Only the server calls this, with ownerId from requireApiUser(); never from request input. */
export function createReingestReserver(admin: SupabaseClient) {
  return async (targetId: string, ownerId: string): Promise<Reservation> => {
    const { data, error } = await admin.rpc("reserve_reingestion_attempt", {
      p_target_id: targetId,
      p_owner_id: ownerId,
    });
    if (error?.code === "P0001") {
      if (error.message === "INGESTION_START_LIMIT")
        throw new IngestionLimitError("INGESTION_START_LIMIT");
      if (isReingestErrorCode(error.message)) throw new IngestionReingestError(error.message);
    }
    // Deleted or no longer owned between the ownership check and the reservation lock.
    if (error?.code === "P0002") throw new TargetNotFoundError();
    if (error || !isReservation(data)) throw new IngestionPersistenceError();
    return data;
  };
}

export type IngestionReingestDependencies = IngestionDependencies & {
  reserve: NonNullable<IngestionDependencies["reserve"]>;
};

export function ingestionReingestDependencies(): IngestionReingestDependencies {
  return {
    ...ingestionDependencies(),
    reserve: createReingestReserver(createIngestionAdminClient()),
  };
}

/** The reserve override is required, so a refresh can never fall back to create semantics. */
export function beginIngestionReingest(
  client: SupabaseClient,
  ownerId: string,
  targetId: string,
  deps: IngestionReingestDependencies,
) {
  return beginIngestion(client, ownerId, targetId, deps);
}

type BaselineRow = Pick<
  IngestionAttemptRow,
  "id" | "analysis_target_id" | "owner_id" | "status" | "started_at" | "finished_at" | "saved_count"
>;

/** The last successful attempt for an owned target (RLS-scoped session client), or null. */
export async function getLastSuccessfulAttempt(
  client: SupabaseClient,
  ownerId: string,
  targetId: string,
): Promise<BaselineRow | null> {
  const { data, error } = await client
    .from("ingestion_attempts")
    .select("id, analysis_target_id, owner_id, status, started_at, finished_at, saved_count")
    .eq("owner_id", ownerId)
    .eq("analysis_target_id", targetId)
    .eq("status", "succeeded")
    .order("started_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle<BaselineRow>();
  if (error) throw new IngestionPersistenceError();
  // Re-check every filter: a dropped filter must never present another attempt as the dataset.
  if (
    !data ||
    data.status !== "succeeded" ||
    data.owner_id !== ownerId ||
    data.analysis_target_id !== targetId
  )
    return null;
  return data;
}

/**
 * The dataset baseline for the workspace refresh control. undefined = couldn't load (the control
 * stays disabled), null = nothing collected yet (the first collection uses the Ingestion panel).
 * When the latest attempt succeeded it IS the baseline, so no extra read is needed.
 */
export async function loadReingestBaseline(
  client: SupabaseClient,
  ownerId: string,
  targetId: string,
  latest: IngestionSummary | null,
): Promise<ReingestBaseline | null | undefined> {
  if (!latest) return undefined;
  if (latest.state === "not_ingested") return null;
  if (latest.state === "succeeded")
    return { finishedAt: latest.finishedAt, savedCount: latest.savedCount };
  try {
    const row = await getLastSuccessfulAttempt(client, ownerId, targetId);
    return row ? { finishedAt: row.finished_at, savedCount: row.saved_count } : null;
  } catch {
    console.error("Workspace operation failed", {
      operation: "reingest-baseline",
      category: "LOAD_FAILED",
    });
    return undefined;
  }
}
