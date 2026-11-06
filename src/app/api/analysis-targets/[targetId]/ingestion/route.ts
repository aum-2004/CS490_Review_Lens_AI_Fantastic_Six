import type { NextRequest } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getOwnedTargetOrThrow,
  TargetNotFoundError,
} from "@/services/analysis-targets/target-ownership";
import { requireApiUser } from "@/services/auth/access-control";
import {
  IngestionSourceNotConfiguredError,
  startTargetIngestion,
} from "@/services/ingestion/start-target-ingestion";

import { errorResponse, logFailure, successResponse, targetNotFoundResponse } from "../responses";

/**
 * S1-013 minimal guarded ingestion start. S1-019 owns the full submission flow.
 * The request body is never read: the owner comes from the session, the target from the URL.
 */
export async function POST(
  _request: NextRequest,
  ctx: RouteContext<"/api/analysis-targets/[targetId]/ingestion">,
) {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;
  const { targetId } = await ctx.params;

  try {
    const client = await createSupabaseServerClient(true);
    // Ownership is proven before the provider is contacted or any review is processed (S1-BR-018).
    const target = await getOwnedTargetOrThrow(client, targetId, auth.user.id);
    const started = await startTargetIngestion(target);
    return successResponse(202, started);
  } catch (error) {
    if (error instanceof TargetNotFoundError) return targetNotFoundResponse();
    if (error instanceof IngestionSourceNotConfiguredError) {
      return errorResponse(409, error.code, error.message);
    }
    logFailure("start-ingestion", error);
    return errorResponse(
      500,
      "INGESTION_START_FAILED",
      "We couldn't start review import. Please try again.",
    );
  }
}
