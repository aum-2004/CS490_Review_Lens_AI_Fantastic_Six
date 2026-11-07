import "server-only";
import { ingestionErrorMessage } from "./ingestion-state";

export const MAX_PROVIDER_RESULT_BYTES = 2 * 1024 * 1024;
export const MAX_INGESTED_REVIEWS = 30;

export class IngestionLimitError extends Error {
  constructor(readonly code: "INGESTION_START_LIMIT" | "INGESTION_RESULT_LIMIT") {
    super(ingestionErrorMessage(code));
    this.name = "IngestionLimitError";
  }
}

/** Bound the normalized persistence input as well as the provider transport. */
export function assertIngestionResultWithinLimits(
  rows: Record<string, unknown>[],
  identity: { businessName: string },
) {
  const tooLong = (value: unknown, max: number) =>
    typeof value === "string" && Array.from(value).length > max;
  if (
    rows.length > MAX_INGESTED_REVIEWS ||
    Buffer.byteLength(JSON.stringify(rows), "utf8") > MAX_PROVIDER_RESULT_BYTES ||
    Buffer.byteLength(JSON.stringify(identity), "utf8") > 16_384 ||
    tooLong(identity.businessName, 200) ||
    rows.some(
      (row) =>
        tooLong(row.text, 10_000) ||
        tooLong(row.reviewer_name, 200) ||
        tooLong(row.source_review_id, 256) ||
        tooLong(row.review_url, 2048) ||
        tooLong(row.review_date, 64) ||
        Buffer.byteLength(JSON.stringify(row.source_metadata ?? null), "utf8") > 16_384,
    )
  )
    throw new IngestionLimitError("INGESTION_RESULT_LIMIT");
}
