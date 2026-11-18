import { MAX_METADATA_BYTES } from "@/services/reviews/review-service";

// Input limits for POST /api/analysis-targets/[targetId]/reviews. They are checked on the raw
// request, before the normalizer or the store runs, and any breach is a 400 INVALID_REVIEW_INPUT.

/** Upper bound on one request so a single call cannot write an unbounded batch. */
export const MAX_REVIEWS_PER_REQUEST = 100;

/**
 * Upper bound on the request body, read as a stream and enforced before JSON parsing. 2 MiB
 * comfortably covers typical batches. Worst-case field sizes (for example 100 reviews with full
 * metadata, or emoji-heavy text) can exceed it, in which case the request is rejected with
 * 400 INVALID_REVIEW_INPUT and the client must send a smaller batch.
 */
export const MAX_REQUEST_BODY_BYTES = 2 * 1024 * 1024;

/**
 * Per-field limits, in characters (Unicode code points, as PostgreSQL's char_length counts).
 * Keep these at or below the database backstops in
 * supabase/migrations/20261108000000_harden_review_writes.sql.
 */
export const MAX_REVIEW_TEXT_CHARS = 10_000;
export const MAX_REVIEWER_NAME_CHARS = 200;
export const MAX_SOURCE_REVIEW_ID_CHARS = 256;
export const MAX_REVIEW_URL_CHARS = 2_048;
export const MAX_REVIEW_DATE_CHARS = 64;
/** `metadata` is limited by its serialized size, the same budget persistence uses. */
export const MAX_REVIEW_METADATA_BYTES = MAX_METADATA_BYTES;

const FIELD_CHAR_LIMITS = {
  text: MAX_REVIEW_TEXT_CHARS,
  reviewerName: MAX_REVIEWER_NAME_CHARS,
  sourceReviewId: MAX_SOURCE_REVIEW_ID_CHARS,
  reviewUrl: MAX_REVIEW_URL_CHARS,
  reviewDate: MAX_REVIEW_DATE_CHARS,
} as const;

export type BodyReadResult = { ok: true; body: unknown } | { ok: false; reason: "TOO_LARGE" };

/**
 * Reads the request body as JSON without ever holding more than `maxBytes` of it. A declared
 * Content-Length over the limit is rejected without reading; otherwise the stream is cancelled as
 * soon as it passes the limit, because Content-Length can be absent or wrong. Malformed JSON
 * yields `body: undefined` so the caller's shape check rejects it.
 */
export async function readJsonBodyWithLimit(
  request: Request,
  maxBytes = MAX_REQUEST_BODY_BYTES,
): Promise<BodyReadResult> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) return { ok: false, reason: "TOO_LARGE" };
  if (!request.body) return { ok: true, body: undefined };

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      return { ok: false, reason: "TOO_LARGE" };
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return { ok: true, body: JSON.parse(new TextDecoder().decode(bytes)) };
  } catch {
    return { ok: true, body: undefined };
  }
}

// Counts code points, so an emoji is one character. The body limit keeps this cheap.
const charCount = (value: string): number => Array.from(value).length;

/**
 * Returns a safe message for the first raw review with an oversized field, or null. Only string
 * values are measured; other types are left to the normalizer, which drops or rejects them.
 */
export function findOversizedField(records: unknown[]): string | null {
  for (const [index, record] of records.entries()) {
    if (typeof record !== "object" || record === null) continue;
    const fields = record as Record<string, unknown>;

    for (const [field, limit] of Object.entries(FIELD_CHAR_LIMITS)) {
      const value = fields[field];
      if (typeof value === "string" && charCount(value) > limit) {
        return `Review ${index}: ${field} must be at most ${limit} characters.`;
      }
    }

    if (fields.metadata !== undefined) {
      const bytes = new TextEncoder().encode(JSON.stringify(fields.metadata) ?? "").length;
      if (bytes > MAX_REVIEW_METADATA_BYTES) {
        return `Review ${index}: metadata must be at most ${MAX_REVIEW_METADATA_BYTES} bytes.`;
      }
    }
  }
  return null;
}
