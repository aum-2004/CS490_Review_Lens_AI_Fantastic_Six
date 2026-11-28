import type { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireApiUser } from "@/services/auth/access-control";
import { TargetNotFoundError } from "@/services/analysis-targets/target-ownership";
import {
  IngestionBindingPendingError,
  IngestionGateError,
} from "@/services/ingestion/ingestion-lifecycle";
import { IngestionLimitError } from "@/services/ingestion/ingestion-limits";
import { ingestionRecoveryConfigured } from "@/services/ingestion/ingestion-recovery";
import {
  beginIngestionReingest,
  IngestionReingestError,
  ingestionReingestDependencies,
} from "@/services/ingestion/ingestion-reingest";
import { reingestErrorMessage } from "@/services/ingestion/ingestion-reingest-state";
import { ingestionEnabled, ingestionStorageApproved } from "@/services/ingestion/ingestion-runtime";
import { ingestionErrorMessage } from "@/services/ingestion/ingestion-state";
import {
  errorResponse,
  logFailure,
  successResponse,
  targetNotFoundResponse,
} from "../../responses";

/** A paid start must not be triggerable by another site, even with the owner's cookies. */
function browserOriginAllowed(request: NextRequest) {
  if (request.headers.get("sec-fetch-site") === "cross-site") return false;
  const origin = request.headers.get("origin");
  if (!origin) return true; // Non-browser clients still need a verified session and ownership.
  try {
    const url = new URL(origin);
    // Compare with the browser-facing host; behind a proxy that is the forwarded host.
    const host =
      request.headers.get("x-forwarded-host") ??
      request.headers.get("host") ??
      request.nextUrl.host;
    return (url.protocol === "http:" || url.protocol === "https:") && url.host === host;
  } catch {
    return false;
  }
}

/**
 * S3-009: start a refresh of an existing owned analysis. The body and query string are never read:
 * the owner comes from the verified session and the target only from the path.
 */
export async function POST(
  request: NextRequest,
  ctx: RouteContext<"/api/analysis-targets/[targetId]/ingestion/reingest">,
) {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;
  if (!browserOriginAllowed(request))
    return errorResponse(403, "FORBIDDEN", "This request is not allowed.");
  if (!ingestionEnabled())
    return errorResponse(503, "INGESTION_DISABLED", ingestionErrorMessage("INGESTION_DISABLED"));
  if (!ingestionStorageApproved())
    return errorResponse(
      503,
      "STORAGE_NOT_APPROVED",
      ingestionErrorMessage("STORAGE_NOT_APPROVED"),
    );
  if (!ingestionRecoveryConfigured())
    return errorResponse(
      503,
      "RECOVERY_NOT_CONFIGURED",
      ingestionErrorMessage("RECOVERY_NOT_CONFIGURED"),
    );
  const { targetId } = await ctx.params;
  try {
    const client = await createSupabaseServerClient(true);
    const result = await beginIngestionReingest(
      client,
      auth.user.id,
      targetId,
      ingestionReingestDependencies(),
    );
    return successResponse(result.state === "processing" ? 202 : 200, result);
  } catch (error) {
    if (error instanceof TargetNotFoundError) return targetNotFoundResponse();
    if (error instanceof IngestionReingestError)
      return errorResponse(409, error.code, reingestErrorMessage(error.code));
    if (error instanceof IngestionBindingPendingError)
      return errorResponse(503, error.code, error.message);
    if (error instanceof IngestionLimitError)
      return errorResponse(
        error.code === "INGESTION_START_LIMIT" ? 429 : 503,
        error.code,
        ingestionErrorMessage(error.code),
      );
    if (error instanceof IngestionGateError)
      return errorResponse(
        error.code === "SOURCE_NOT_CONFIGURED" ? 422 : 503,
        error.code,
        ingestionErrorMessage(error.code),
      );
    logFailure("reingest", error);
    return errorResponse(
      500,
      "REINGEST_START_FAILED",
      reingestErrorMessage("REINGEST_START_FAILED"),
    );
  }
}
