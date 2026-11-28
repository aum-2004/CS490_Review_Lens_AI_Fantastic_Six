import { NextResponse, type NextRequest } from "next/server";
import { validateAnalysisNameInput } from "@/lib/validation/analysis-target";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireApiUser } from "@/services/auth/access-control";
import { renameAnalysisTarget } from "@/services/analysis-targets/analysis-target-repository";
import { readJsonBodyWithLimit } from "./reviews/review-input";
import { errorResponse, logFailure, successResponse, targetNotFoundResponse } from "./responses";
import { deleteOwnedAnalysis } from "@/services/analysis-targets/delete-owned-analysis";
import {
  getOwnedTargetOrThrow,
  TargetNotFoundError,
} from "@/services/analysis-targets/target-ownership";

const PRIVATE_HEADERS = { "Cache-Control": "private, no-store" };
const MAX_RENAME_BODY_BYTES = 4_096;

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ targetId: string }> },
) {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;
  const mediaType = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  if (mediaType !== "application/json") {
    return errorResponse(415, "INVALID_CONTENT_TYPE", "Send the analysis name as JSON.");
  }
  try {
    const body = await readJsonBodyWithLimit(request, MAX_RENAME_BODY_BYTES);
    if (!body.ok) {
      return errorResponse(
        413,
        "RENAME_REQUEST_TOO_LARGE",
        "Rename requests must be 4 KB or smaller.",
      );
    }
    const input = validateAnalysisNameInput(body.body);
    if (!input.success) {
      return NextResponse.json(
        { success: false, error: input.error },
        { status: 400, headers: PRIVATE_HEADERS },
      );
    }
    const { targetId } = await params;
    const client = await createSupabaseServerClient(true);
    const target = await renameAnalysisTarget(client, auth.user.id, targetId, input.data.name);
    if (!target) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "TARGET_NOT_FOUND",
            message: "This analysis isn't available to your account. Go back to My Targets.",
          },
        },
        { status: 404, headers: PRIVATE_HEADERS },
      );
    }
    return NextResponse.json({ success: true, data: target }, { headers: PRIVATE_HEADERS });
  } catch {
    console.error("Analysis target operation failed", {
      operation: "rename",
      category: "RENAME_FAILED",
    });
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "ANALYSIS_TARGET_RENAME_FAILED",
          message: "We couldn't rename this analysis. Please try again.",
        },
      },
      { status: 500, headers: PRIVATE_HEADERS },
    );
  }
}

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
