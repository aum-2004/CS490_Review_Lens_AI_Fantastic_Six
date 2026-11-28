/** S3-009 refresh codes and copy. Client-safe: the workspace control and the route share them. */
import { ingestionErrorMessage } from "./ingestion-state";

export const REINGEST_ERROR_CODES = [
  "REINGEST_IN_PROGRESS",
  "REINGEST_BLOCKED",
  "REINGEST_UNAVAILABLE",
] as const;
export type ReingestErrorCode = (typeof REINGEST_ERROR_CODES)[number];

export function isReingestErrorCode(value: unknown): value is ReingestErrorCode {
  return REINGEST_ERROR_CODES.includes(value as ReingestErrorCode);
}

/** The last successful attempt: the dataset that a running or failed refresh never replaces. */
export interface ReingestBaseline {
  finishedAt: string | null;
  /** New reviews that attempt added to the dataset (S3-011: matched reviews are not counted). */
  savedCount: number;
}

/**
 * S3-009: what "Try again" may start after a FAILED attempt.
 * - "refresh": `POST .../ingestion/reingest`, a new refresh of an existing dataset.
 * - "initial": `POST .../ingestion`, the first collection, which never succeeded.
 * - "unknown": the lookups couldn't tell. It is never treated as "initial" (for a target that
 *   already has a dataset, the create path only returns the earlier success) and never guessed as
 *   "refresh" (a paid start): "Try again" stays disabled until the lookups are reloaded.
 */
export type RetryClassification = "refresh" | "initial" | "unknown";

/**
 * Resolution rules, in order:
 * 1. A persisted attempt_kind that was read successfully is authoritative: reingest → refresh,
 *    initial → initial. (It is read only for a failed latest attempt; null = not read or
 *    unreadable.)
 * 2. Otherwise the last-successful-attempt lookup decides: a successful baseline → refresh;
 *    none (null) → initial.
 * 3. Otherwise (baseline undefined: unreadable, or the status itself didn't load) → unknown.
 */
export function classifyRetry(
  attemptKind: "initial" | "reingest" | null,
  baseline: ReingestBaseline | null | undefined,
): RetryClassification {
  if (attemptKind === "reingest") return "refresh";
  if (attemptKind === "initial") return "initial";
  if (baseline) return "refresh";
  if (baseline === null) return "initial";
  return "unknown";
}

const MESSAGES: Record<string, string> = {
  REINGEST_IN_PROGRESS:
    "Reviews are already being refreshed for this analysis. Wait for that refresh to finish.",
  REINGEST_BLOCKED:
    "A previous collection for this analysis still needs to be reconciled by the project team, so a refresh can't start yet. Your saved reviews are unchanged.",
  REINGEST_UNAVAILABLE:
    "Refreshing becomes available after the first review collection for this analysis completes.",
  REINGEST_START_FAILED: "We couldn't start the review refresh. Please try again.",
};

/** Fixed, safe copy only: unknown codes fall back to the shared ingestion messages. */
export function reingestErrorMessage(code: string | null | undefined): string {
  return MESSAGES[code ?? ""] ?? ingestionErrorMessage(code);
}
