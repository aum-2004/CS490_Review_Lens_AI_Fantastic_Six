import { NextResponse } from "next/server";
import { validateAnalysisNameInput } from "@/lib/validation/analysis-target";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireApiUser } from "@/services/auth/access-control";
import { renameAnalysisTarget } from "@/services/analysis-targets/analysis-target-repository";
import { readJsonBodyWithLimit } from "./reviews/review-input";
import { errorResponse } from "./responses";

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
