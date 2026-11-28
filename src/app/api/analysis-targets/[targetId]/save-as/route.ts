import { NextResponse, type NextRequest } from "next/server";
import { validateAnalysisNameInput } from "@/lib/validation/analysis-target";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireApiUser } from "@/services/auth/access-control";
import { getAnalysisTargetById } from "@/services/analysis-targets/analysis-target-repository";
import {
  getOwnedTargetOrThrow,
  TargetNotFoundError,
} from "@/services/analysis-targets/target-ownership";
import { SaveAnalysisAsError, saveAnalysisAs } from "@/services/analysis-targets/save-analysis-as";
import { readJsonBodyWithLimit } from "../reviews/review-input";
import {
  errorResponse,
  logFailure,
  PRIVATE_HEADERS,
  successResponse,
  targetNotFoundResponse,
} from "../responses";

const MAX_SAVE_AS_BODY_BYTES = 4_096;

/**
 * S3-003: POST { name } creates a separate analysis from the owned analysis `targetId`.
 * Responds 201 with the new analysis. The source analysis is never changed.
 */
export async function POST(
  request: NextRequest,
  ctx: RouteContext<"/api/analysis-targets/[targetId]/save-as">,
) {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;
  // JSON only: a cross-site HTML form cannot send it without a CORS preflight.
  const mediaType = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  if (mediaType !== "application/json") {
    return errorResponse(415, "INVALID_CONTENT_TYPE", "Send the analysis name as JSON.");
  }
  const { targetId } = await ctx.params;
  try {
    const client = await createSupabaseServerClient(true);
    // Ownership before the body (S1-013). The RPC checks it again atomically.
    await getOwnedTargetOrThrow(client, targetId, auth.user.id);

    const body = await readJsonBodyWithLimit(request, MAX_SAVE_AS_BODY_BYTES);
    if (!body.ok) {
      return errorResponse(
        413,
        "SAVE_AS_REQUEST_TOO_LARGE",
        "Save As requests must be 4 KB or smaller.",
      );
    }
    const input = validateAnalysisNameInput(body.body);
    if (!input.success) {
      return NextResponse.json(
        { success: false, error: input.error },
        { status: 400, headers: PRIVATE_HEADERS },
      );
    }

    const copyId = await saveAnalysisAs(client, targetId, input.data.name);
    const copy = await getAnalysisTargetById(client, auth.user.id, copyId);
    if (!copy) throw new SaveAnalysisAsError("SAVE_AS_FAILED");
    return successResponse(201, {
      id: copy.id,
      name: copy.name,
      sourceUrl: copy.sourceUrl,
      platform: copy.platform,
    });
  } catch (error) {
    if (error instanceof TargetNotFoundError) return targetNotFoundResponse();
    if (error instanceof SaveAnalysisAsError && error.code === "ANALYSIS_LIMIT") {
      return errorResponse(409, error.code, error.message);
    }
    logFailure("save-as", error);
    return errorResponse(
      500,
      "SAVE_AS_FAILED",
      "We couldn't save a copy of this analysis. Please try again.",
    );
  }
}
