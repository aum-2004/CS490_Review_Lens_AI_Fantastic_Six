import type { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireApiUser } from "@/services/auth/access-control";
import {
  getOwnedTargetOrThrow,
  TargetNotFoundError,
} from "@/services/analysis-targets/target-ownership";
import {
  getLatestAttempt,
  summarizeAttempt,
} from "@/services/ingestion/ingestion-attempt-repository";
import {
  beginIngestion,
  IngestionGateError,
  IngestionBindingPendingError,
} from "@/services/ingestion/ingestion-lifecycle";
import { ingestionRecoveryConfigured } from "@/services/ingestion/ingestion-recovery";
import {
  ingestionDependencies,
  ingestionEnabled,
  ingestionStorageApproved,
} from "@/services/ingestion/ingestion-runtime";
import { ingestionErrorMessage } from "@/services/ingestion/ingestion-state";
import { IngestionLimitError } from "@/services/ingestion/ingestion-limits";
import { errorResponse, logFailure, successResponse, targetNotFoundResponse } from "../responses";

export async function GET(
  _request: NextRequest,
  ctx: RouteContext<"/api/analysis-targets/[targetId]/ingestion">,
) {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;
  const { targetId } = await ctx.params;
  try {
    const client = await createSupabaseServerClient(true);
    await getOwnedTargetOrThrow(client, targetId, auth.user.id);
    return successResponse(
      200,
      summarizeAttempt(await getLatestAttempt(client, auth.user.id, targetId)),
    );
  } catch (error) {
    if (error instanceof TargetNotFoundError) return targetNotFoundResponse();
    logFailure("ingestion-status", error);
    return errorResponse(
      500,
      "INGESTION_STATUS_FAILED",
      "We couldn't load the ingestion status. Please try again.",
    );
  }
}

export async function POST(
  _request: NextRequest,
  ctx: RouteContext<"/api/analysis-targets/[targetId]/ingestion">,
) {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;
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
    const result = await beginIngestion(client, auth.user.id, targetId, ingestionDependencies());
    return successResponse(result.state === "processing" ? 202 : 200, result);
  } catch (error) {
    if (error instanceof TargetNotFoundError) return targetNotFoundResponse();
    if (error instanceof IngestionBindingPendingError)
      return errorResponse(503, error.code, error.message);
    if (error instanceof IngestionLimitError)
      return errorResponse(
        error.code === "INGESTION_START_LIMIT" ? 429 : 503,
        error.code,
        error.message,
      );
    if (error instanceof IngestionGateError)
      return errorResponse(
        error.code === "SOURCE_NOT_CONFIGURED" ? 422 : 503,
        error.code,
        ingestionErrorMessage(error.code),
      );
    logFailure("start-ingestion", error);
    return errorResponse(
      500,
      "INGESTION_START_FAILED",
      "We couldn't start review collection. Please try again.",
    );
  }
}
