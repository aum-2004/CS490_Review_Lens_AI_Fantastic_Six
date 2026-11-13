import type { NextRequest } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getOwnedTargetOrThrow,
  TargetNotFoundError,
} from "@/services/analysis-targets/target-ownership";
import { requireApiUser } from "@/services/auth/access-control";
import { getReviewSummary } from "@/services/reviews/review-summary";
import { createSupabaseReviewStore } from "@/services/reviews/supabase-review-store";

import { errorResponse, logFailure, successResponse, targetNotFoundResponse } from "../responses";

export async function GET(
  _request: NextRequest,
  ctx: RouteContext<"/api/analysis-targets/[targetId]/review-summary">,
) {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;
  const { targetId } = await ctx.params;

  try {
    const client = await createSupabaseServerClient(true);
    await getOwnedTargetOrThrow(client, targetId, auth.user.id);
    const summary = await getReviewSummary(
      createSupabaseReviewStore(client),
      client,
      auth.user.id,
      targetId,
    );
    return successResponse(200, summary);
  } catch (error) {
    if (error instanceof TargetNotFoundError) return targetNotFoundResponse();
    logFailure("review-summary", error);
    return errorResponse(
      500,
      "REVIEW_SUMMARY_LOAD_FAILED",
      "We couldn't load the review summary. Please try again.",
    );
  }
}
