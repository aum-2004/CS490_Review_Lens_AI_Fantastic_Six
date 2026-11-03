import {
  MAX_RATING,
  MIN_RATING,
  type BatchResult,
  type NormalizeResult,
  type RawReview,
} from "./types";

const cleanString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;

const cleanDate = (value: unknown): Date | undefined => {
  if (value === undefined || value === null || value === "") return undefined;
  if (!(typeof value === "string" || typeof value === "number" || value instanceof Date)) {
    return undefined;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) || date.getTime() > Date.now() ? undefined : date;
};

const cleanUrl = (value: unknown): string | undefined => {
  const raw = cleanString(value);
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    return url.protocol === "http:" || url.protocol === "https:" ? raw : undefined;
  } catch {
    return undefined;
  }
};

const cleanMetadata = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : undefined;

/** Returns "missing" when absent/blank, a number when valid, or "invalid". */
const parseRating = (value: unknown): number | "missing" | "invalid" => {
  if (value === undefined || value === null) return "missing";
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") return "missing";
    if (!/^\d+(\.\d+)?$/.test(trimmed)) return "invalid";
    value = Number(trimmed);
  }
  if (typeof value !== "number" || !Number.isFinite(value)) return "invalid";
  return value >= MIN_RATING && value <= MAX_RATING ? value : "invalid";
};

/**
 * Rejection policy (S1-BR-020, S1-BR-024):
 * - missing/blank text -> rejected
 * - missing/invalid rating -> rejected
 * - malformed or future optional date, bad URL, bad metadata -> dropped, review kept
 * Required fields are never defaulted or fabricated.
 */
export function normalizeReview(raw: unknown, index = 0): NormalizeResult {
  const record: RawReview = typeof raw === "object" && raw !== null ? (raw as RawReview) : {};

  const text = cleanString(record.text);
  if (!text) return { ok: false, reason: "MISSING_TEXT", index };

  const rating = parseRating(record.rating);
  if (rating === "missing") return { ok: false, reason: "MISSING_RATING", index };
  if (rating === "invalid") return { ok: false, reason: "INVALID_RATING", index };

  return {
    ok: true,
    review: {
      text,
      rating,
      sourceReviewId: cleanString(record.sourceReviewId),
      reviewerName: cleanString(record.reviewerName),
      reviewDate: cleanDate(record.reviewDate),
      reviewUrl: cleanUrl(record.reviewUrl),
      sourceMetadata: cleanMetadata(record.metadata),
    },
  };
}

/** One bad record never fails the batch; rejections are reported, not hidden. */
export function normalizeBatch(records: unknown[]): BatchResult {
  const result: BatchResult = { reviews: [], rejected: [] };
  records.forEach((raw, index) => {
    const outcome = normalizeReview(raw, index);
    if (outcome.ok) result.reviews.push(outcome.review);
    else result.rejected.push({ index: outcome.index, reason: outcome.reason });
  });
  return result;
}
