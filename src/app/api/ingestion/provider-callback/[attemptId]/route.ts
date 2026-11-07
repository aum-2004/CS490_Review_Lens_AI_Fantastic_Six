import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createIngestionAdminClient } from "@/lib/supabase/ingestion-admin";
import { createIngestionAttemptWriter } from "@/services/ingestion/ingestion-attempt-repository";
import {
  recoverIngestionBinding,
  validRecoverySignature,
  validProviderCallbackSignature,
} from "@/services/ingestion/ingestion-recovery";

const HEADERS = { "Cache-Control": "private, no-store" };
const MAX_BYTES = 8192;
function failure(status: number, code: string) {
  if (status === 404)
    console.warn("Ingestion recovery denied", {
      operation: "callback",
      category: "CALLBACK_UNAVAILABLE",
    });
  return NextResponse.json(
    { success: false, error: { code, message: "The callback could not be accepted." } },
    { status, headers: HEADERS },
  );
}

/** Public provider boundary authenticated by the provider body HMAC and a per-attempt HMAC.
 * This endpoint binds metadata only. It never fetches results, saves reviews or starts a job.
 */
export async function POST(
  request: NextRequest,
  ctx: RouteContext<"/api/ingestion/provider-callback/[attemptId]">,
) {
  const { attemptId } = await ctx.params;
  if (!validRecoverySignature(attemptId, request.nextUrl.searchParams.get("signature")))
    return failure(404, "CALLBACK_UNAVAILABLE");
  let body: unknown;
  try {
    if (Number(request.headers.get("content-length")) > MAX_BYTES)
      return failure(413, "CALLBACK_TOO_LARGE");
    const reader = request.body?.getReader();
    if (!reader) return failure(400, "INVALID_CALLBACK");
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BYTES) {
        await reader.cancel();
        return failure(413, "CALLBACK_TOO_LARGE");
      }
      chunks.push(value);
    }
    const rawBody = Buffer.concat(chunks);
    if (!validProviderCallbackSignature(rawBody, request.headers.get("x-hub-signature-256")))
      return failure(404, "CALLBACK_UNAVAILABLE");
    body = JSON.parse(rawBody.toString("utf8"));
  } catch {
    return failure(400, "INVALID_CALLBACK");
  }
  if (
    !body ||
    typeof body !== "object" ||
    !("id" in body) ||
    typeof body.id !== "string" ||
    !/^[A-Za-z0-9_-]{1,128}$/.test(body.id)
  )
    return failure(400, "INVALID_CALLBACK");
  try {
    const writer = createIngestionAttemptWriter(createIngestionAdminClient());
    if (!(await recoverIngestionBinding(attemptId, body.id, writer)))
      return failure(404, "CALLBACK_UNAVAILABLE");
    console.info("Ingestion recovery", { operation: "bind-callback", category: "JOB_BOUND" });
    return NextResponse.json({ success: true, data: { received: true } }, { headers: HEADERS });
  } catch {
    // No callback URL, signature, provider ID, raw body or review content in logs.
    console.error("Ingestion recovery failed", {
      operation: "bind-callback",
      category: "BINDING_UNAVAILABLE",
    });
    return failure(503, "CALLBACK_RETRY_REQUIRED");
  }
}
