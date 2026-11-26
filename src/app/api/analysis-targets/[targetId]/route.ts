import type { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireApiUser } from "@/services/auth/access-control";
import { deleteOwnedAnalysis } from "@/services/analysis-targets/delete-owned-analysis";
import {
  getOwnedTargetOrThrow,
  TargetNotFoundError,
} from "@/services/analysis-targets/target-ownership";
import { errorResponse, logFailure, successResponse, targetNotFoundResponse } from "./responses";

function browserOriginAllowed(request: NextRequest) {
  if (request.headers.get("sec-fetch-site") === "cross-site") return false;
  const origin = request.headers.get("origin");
  if (!origin) return true; // Non-browser clients still need a verified session and ownership.
  try {
    const url = new URL(origin);
    // Next may normalize the internal URL to localhost. Like Server Actions, compare
    // Origin to the browser-facing Host (or the deployment proxy's forwarded Host).
    const host =
      request.headers.get("x-forwarded-host") ??
      request.headers.get("host") ??
      request.nextUrl.host;
    return (url.protocol === "http:" || url.protocol === "https:") && url.host === host;
  } catch {
    return false;
  }
}

export async function DELETE(
  request: NextRequest,
  ctx: RouteContext<"/api/analysis-targets/[targetId]">,
) {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;
  // DELETE cannot be submitted by an HTML form; reject cross-origin browser requests too.
  if (!browserOriginAllowed(request)) {
    return errorResponse(403, "FORBIDDEN", "This request is not allowed.");
  }
  const { targetId } = await ctx.params;
  try {
    const client = await createSupabaseServerClient(true);
    await getOwnedTargetOrThrow(client, targetId, auth.user.id);
    // Ignore the entire body and query string: neither can supply ownership or a different target.
    await deleteOwnedAnalysis(client, targetId);
    return successResponse(200, { deleted: true });
  } catch (error) {
    if (error instanceof TargetNotFoundError) return targetNotFoundResponse();
    logFailure("delete-analysis", error);
    return errorResponse(
      500,
      "ANALYSIS_DELETE_FAILED",
      "We couldn't delete this analysis. Please try again.",
    );
  }
}
