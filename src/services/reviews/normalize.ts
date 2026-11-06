import { toStorableText } from "./storable-text";
import {
  MAX_RATING,
  MIN_RATING,
  type BatchResult,
  type NormalizeResult,
  type RawReview,
} from "./types";

/**
 * Postgres rejects \u0000 and lone UTF-16 surrogates in text and jsonb, so they are cleaned
 * before any other check.
 */
const cleanString = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  const cleaned = toStorableText(value).trim();
  return cleaned === "" ? undefined : cleaned;
};

/** Source ids may arrive as numbers; keep them as strings so persistence can dedupe on them. */
const cleanId = (value: unknown): string | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return cleanString(value);
};

// ISO 8601 date, or date-time WITH a timezone (no timezone would depend on the server's zone).
const ISO_DATE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?(Z|[+-]\d{2}:\d{2}))?$/;

const isRealCalendarDay = (iso: string): boolean => {
  const [year, month, day] = iso.slice(0, 10).split("-").map(Number);
  const check = new Date(Date.UTC(year, month - 1, day));
  return (
    check.getUTCFullYear() === year &&
    check.getUTCMonth() === month - 1 &&
    check.getUTCDate() === day
  );
};

/** Accepts only Date objects and ISO 8601 strings. Everything else is dropped. */
const cleanDate = (value: unknown): Date | undefined => {
  let date: Date;
  if (value instanceof Date) {
    date = value;
  } else if (typeof value === "string") {
    const iso = value.trim();
    if (!ISO_DATE.test(iso) || !isRealCalendarDay(iso)) return undefined;
    date = new Date(iso);
  } else {
    return undefined;
  }
  const time = date.getTime();
  return Number.isNaN(time) || time > Date.now() ? undefined : date;
};

const cleanUrl = (value: unknown): string | undefined => {
  const raw = cleanString(value);
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
    if (url.username !== "" || url.password !== "") return undefined;
    return url.href;
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
 * - missing/blank text (after NUL removal) -> rejected
 * - missing/invalid rating -> rejected
 * - non-ISO or future date, bad URL, bad metadata -> dropped, review kept
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
      sourceReviewId: cleanId(record.sourceReviewId),
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
