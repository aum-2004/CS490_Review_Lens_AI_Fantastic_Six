import type { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireApiUser } from "@/services/auth/access-control";
import { TargetNotFoundError } from "@/services/analysis-targets/target-ownership";
import {
  reconcileIngestion,
  IngestionRefreshError,
} from "@/services/ingestion/ingestion-lifecycle";
import { ingestionErrorMessage } from "@/services/ingestion/ingestion-state";
import { ingestionDependencies, ingestionEnabled } from "@/services/ingestion/ingestion-runtime";
import { IngestionLimitError } from "@/services/ingestion/ingestion-limits";
import {
  errorResponse,
  logFailure,
  successResponse,
  targetNotFoundResponse,
} from "../../responses";

/** Ignore browser job IDs: the provider request is retrieved from server storage. */
export async function POST(
  _request: NextRequest,
  ctx: RouteContext<"/api/analysis-targets/[targetId]/ingestion/refresh">,
) {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;
  if (!ingestionEnabled())
    return errorResponse(503, "INGESTION_DISABLED", ingestionErrorMessage("INGESTION_DISABLED"));
  const { targetId } = await ctx.params;
  try {
    const client = await createSupabaseServerClient(true);
    const result = await reconcileIngestion(
      client,
      auth.user.id,
      targetId,
      ingestionDependencies(),
    );
    return successResponse(200, result);
  } catch (error) {
    if (error instanceof TargetNotFoundError) return targetNotFoundResponse();
    if (error instanceof IngestionRefreshError || error instanceof IngestionLimitError)
      return errorResponse(503, error.code, ingestionErrorMessage(error.code));
    logFailure("refresh-ingestion", error);
    return errorResponse(
      500,
      "INGESTION_REFRESH_FAILED",
      "We couldn't refresh the ingestion status. Please try again.",
    );
  }
}
