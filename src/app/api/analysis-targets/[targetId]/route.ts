import { NextResponse } from "next/server";
import { validateAnalysisNameInput } from "@/lib/validation/analysis-target";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireApiUser } from "@/services/auth/access-control";
import { renameAnalysisTarget } from "@/services/analysis-targets/analysis-target-repository";

const PRIVATE_HEADERS = { "Cache-Control": "private, no-store" };

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ targetId: string }> },
) {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;
  const input = validateAnalysisNameInput(await request.json().catch(() => undefined));
  if (!input.success) {
    return NextResponse.json(
      { success: false, error: input.error },
      { status: 400, headers: PRIVATE_HEADERS },
    );
  }
  try {
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
