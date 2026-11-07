import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { createIngestionAttemptWriter } from "./ingestion-attempt-repository";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function recoveryConfig() {
  const secret = process.env.INGESTION_CALLBACK_SECRET;
  const configuredOrigin = process.env.INGESTION_CALLBACK_ORIGIN;
  if (!secret || secret.length < 32 || !configuredOrigin) return null;
  try {
    const url = new URL(configuredOrigin);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    )
      return null;
    return { secret, origin: url.origin };
  } catch {
    return null;
  }
}
export function ingestionRecoveryConfigured() {
  return recoveryConfig() !== null;
}
function signature(attemptId: string, secret: string) {
  return createHmac("sha256", secret)
    .update(`reviewlens:ingestion-callback:v1:${attemptId}`)
    .digest();
}
/** The provider retains this per-attempt correlation URL. It is never returned to a browser. */
export function ingestionRecoveryUrl(attemptId: string) {
  const config = recoveryConfig();
  if (!config || !UUID.test(attemptId)) throw new Error("Ingestion recovery is not configured.");
  const url = new URL(`/api/ingestion/provider-callback/${attemptId}`, config.origin);
  url.searchParams.set("signature", signature(attemptId, config.secret).toString("hex"));
  return url.href;
}
export function validRecoverySignature(attemptId: string, supplied: string | null) {
  const config = recoveryConfig();
  if (!config || !UUID.test(attemptId) || !supplied || !/^[a-f0-9]{64}$/i.test(supplied))
    return false;
  return timingSafeEqual(signature(attemptId, config.secret), Buffer.from(supplied, "hex"));
}
/** Outscraper's native body signature authenticates the provider in addition to our
 * per-attempt correlation capability. Never verify a reserialized JSON object.
 */
export function validProviderCallbackSignature(rawBody: Uint8Array, supplied: string | null) {
  const key = process.env.OUTSCRAPER_API_KEY;
  const match = supplied?.match(/^sha256=([a-f0-9]{64})$/i);
  if (!key?.trim() || !match) return false;
  const expected = createHmac("sha256", key).update(rawBody).digest();
  return timingSafeEqual(expected, Buffer.from(match[1], "hex"));
}

/** Call only after verifying the server-generated capability. Callback fields cannot supply
 * ownership, source, results, status or a results URL. Recovery only attaches a provider ID.
 */
export async function recoverIngestionBinding(
  attemptId: string,
  jobId: string,
  writer: ReturnType<typeof createIngestionAttemptWriter>,
) {
  const attempt = await writer.findForRecovery(attemptId);
  if (!attempt) return false;
  await writer.bind(attempt.id, attempt.owner_id, jobId);
  return true;
}
