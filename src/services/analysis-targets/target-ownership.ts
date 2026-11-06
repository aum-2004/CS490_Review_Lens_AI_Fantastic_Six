import type { SupabaseClient } from "@supabase/supabase-js";

import { type AnalysisTarget, getAnalysisTargetById } from "./analysis-target-repository";

/**
 * Thrown when the target does not exist OR belongs to another user.
 * The two cases are deliberately indistinguishable (maps to HTTP 404) so
 * responses never reveal another user's private resource.
 */
export class TargetNotFoundError extends Error {
  readonly code = "TARGET_NOT_FOUND";

  constructor() {
    super("Analysis target not found.");
    this.name = "TargetNotFoundError";
  }
}

/**
 * S1-013: parent-ownership guard for every child operation on an AnalysisTarget (reviews,
 * ingestion). Call it before reading the request body or doing any child work.
 *
 * Returns the target only if it belongs to `userId`. Missing, foreign, and malformed ids all throw
 * the same `TargetNotFoundError`. `userId` must come from `requireApiUser()`, never from request
 * input (S1-BR-010), and `client` must be the session-scoped client so RLS checks it again.
 */
export async function getOwnedTargetOrThrow(
  client: SupabaseClient,
  targetId: string,
  userId: string,
): Promise<AnalysisTarget> {
  const target = await getAnalysisTargetById(client, userId, targetId);
  // The query already filters on owner_id; re-checking keeps the guard correct if that changes.
  if (!target || target.ownerId !== userId) {
    throw new TargetNotFoundError();
  }
  return target;
}
