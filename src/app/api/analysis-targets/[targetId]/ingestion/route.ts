import type { NextRequest } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getOwnedTargetOrThrow,
  TargetNotFoundError,
} from "@/services/analysis-targets/target-ownership";
import { requireApiUser } from "@/services/auth/access-control";
import {
  submitReviewSource,
  SubmitReviewSourceError,
} from "@/services/ingestion/submit-review-source";

import { errorResponse, logFailure, successResponse, targetNotFoundResponse } from "../responses";

/**
 * S1-019 guarded ingestion submission. The request body is never read: the owner comes from the
 * session, the target from the URL, and the provider receives only stored target source data.
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
    const started = await submitReviewSource(auth.user.id, targetId, {
      getTargetById: async () => target,
    });
    return successResponse(202, started);
  } catch (error) {
    if (error instanceof TargetNotFoundError) return targetNotFoundResponse();
    if (error instanceof SubmitReviewSourceError) {
      if (error.code === "TARGET_NOT_FOUND") return targetNotFoundResponse();
      if (error.code === "SOURCE_NOT_CONFIGURED") {
        return errorResponse(422, error.code, error.message);
      }
    }
    logFailure("start-ingestion", error);
    return errorResponse(
      500,
      "INGESTION_START_FAILED",
      "We couldn't start review import. Please try again.",
    );
  }
}
