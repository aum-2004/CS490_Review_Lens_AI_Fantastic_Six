import { NextResponse } from "next/server";
import { validateAnalysisTargetInput } from "@/lib/validation/analysis-target";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  AnalysisTargetPersistenceError,
  createAnalysisTarget,
} from "@/services/analysis-targets/analysis-target-repository";
import { requireApiUser } from "@/services/auth/access-control";
import { listAnalysisTargets } from "@/services/analysis-targets/list-analysis-targets";

const PRIVATE_HEADERS = { "Cache-Control": "private, no-store" };

export async function GET() {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;

  try {
    const client = await createSupabaseServerClient(true);
    const targets = await listAnalysisTargets(client, auth.user.id);
    return NextResponse.json({ success: true, data: targets }, { headers: PRIVATE_HEADERS });
  } catch (error) {
    console.error("Analysis target operation failed", {
      operation: "list",
      category: error instanceof AnalysisTargetPersistenceError ? error.code : "UNEXPECTED_ERROR",
    });
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "ANALYSIS_TARGET_LIST_FAILED",
          message: "We couldn't load your targets. Please try again.",
        },
      },
      { status: 500, headers: PRIVATE_HEADERS },
    );
  }
}

export async function POST(request: Request) {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;

  // Malformed JSON falls through to the validator, which rejects anything that isn't an object.
  const body: unknown = await request.json().catch(() => undefined);
  const input = validateAnalysisTargetInput(body);
  if (!input.success) {
    return NextResponse.json(
      { success: false, error: input.error },
      { status: 400, headers: PRIVATE_HEADERS },
    );
  }

  try {
    // Only validated fields reach persistence, and the owner is always the verified session user.
    // Any ownerId or userId in the body is ignored. The session-scoped client lets RLS re-check it.
    const client = await createSupabaseServerClient(true);
    const target = await createAnalysisTarget(client, auth.user.id, input.data);
    return NextResponse.json(
      { success: true, data: target },
      { status: 201, headers: PRIVATE_HEADERS },
    );
  } catch (error) {
    // Deliberately omit database errors, request input, and user identifiers.
    console.error("Analysis target operation failed", {
      operation: "create",
      category: error instanceof AnalysisTargetPersistenceError ? error.code : "UNEXPECTED_ERROR",
    });
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "ANALYSIS_TARGET_CREATION_FAILED",
          message: "We couldn't create this target. Please try again.",
        },
      },
      { status: 500, headers: PRIVATE_HEADERS },
    );
  }
}
