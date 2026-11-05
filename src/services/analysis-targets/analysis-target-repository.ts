import type { SupabaseClient } from "@supabase/supabase-js";

import type { SupportedReviewPlatform } from "@/lib/validation/analysis-target";

export type ReviewPlatform = SupportedReviewPlatform;

export interface AnalysisTarget {
  id: string;
  ownerId: string;
  name: string;
  platform: ReviewPlatform;
  sourceUrl: string;
  /** Google place ID resolved during ingestion (S1-020); null until then. */
  googlePlaceId: string | null;
  createdAt: string;
}

/** Already-validated target fields. Ownership is never part of this input. */
export interface NewAnalysisTarget {
  name: string;
  platform: ReviewPlatform;
  sourceUrl: string;
}

interface AnalysisTargetRow {
  id: string;
  owner_id: string;
  name: string;
  platform: ReviewPlatform;
  source_url: string;
  google_place_id: string | null;
  created_at: string;
}

const TABLE = "analysis_targets";
const COLUMNS = "id, owner_id, name, platform, source_url, google_place_id, created_at";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class AnalysisTargetPersistenceError extends Error {
  readonly code = "ANALYSIS_TARGET_PERSISTENCE_FAILED";

  constructor(operation: "create" | "get", options?: { cause?: unknown }) {
    // The message is safe to show; database details stay on `cause` for server-side logging.
    super(`Could not ${operation} the analysis target.`, options);
    this.name = "AnalysisTargetPersistenceError";
  }
}

function toAnalysisTarget(row: AnalysisTargetRow): AnalysisTarget {
  return {
    id: row.id,
    ownerId: row.owner_id,
    name: row.name,
    platform: row.platform,
    sourceUrl: row.source_url,
    googlePlaceId: row.google_place_id,
    createdAt: row.created_at,
  };
}

/**
 * Persists a new AnalysisTarget owned by `ownerId`.
 *
 * `ownerId` must come from the verified session (S1-011), never from request input. The client
 * must be a user-scoped Supabase client so Row Level Security also checks ownership.
 */
export async function createAnalysisTarget(
  client: SupabaseClient,
  ownerId: string,
  input: NewAnalysisTarget,
): Promise<AnalysisTarget> {
  const { data, error } = await client
    .from(TABLE)
    .insert({
      owner_id: ownerId,
      name: input.name,
      platform: input.platform,
      source_url: input.sourceUrl,
    })
    .select(COLUMNS)
    .single<AnalysisTargetRow>();

  if (error || !data) {
    throw new AnalysisTargetPersistenceError("create", { cause: error });
  }

  return toAnalysisTarget(data);
}

/**
 * Returns the target with `targetId` if it belongs to `ownerId`, otherwise `null`.
 *
 * Missing and foreign targets both return `null` so callers can respond with 404 without
 * revealing that another user's target exists.
 */
export async function getAnalysisTargetById(
  client: SupabaseClient,
  ownerId: string,
  targetId: string,
): Promise<AnalysisTarget | null> {
  if (!UUID_PATTERN.test(targetId)) {
    return null;
  }

  const { data, error } = await client
    .from(TABLE)
    .select(COLUMNS)
    .eq("id", targetId)
    .eq("owner_id", ownerId)
    .maybeSingle<AnalysisTargetRow>();

  if (error) {
    throw new AnalysisTargetPersistenceError("get", { cause: error });
  }

  return data ? toAnalysisTarget(data) : null;
}
