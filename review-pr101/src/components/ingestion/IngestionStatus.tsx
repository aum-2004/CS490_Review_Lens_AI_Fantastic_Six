import { cn } from "@/lib/utils/cn";
import type { IngestionState } from "@/services/ingestion/ingestion-state";

const STATES: Record<IngestionState, { label: string; className: string }> = {
  not_ingested: { label: "Not ingested", className: "bg-muted text-muted-foreground" },
  processing: { label: "Ingesting", className: "bg-info/10 text-info" },
  succeeded: { label: "Ingested", className: "bg-success/10 text-success" },
  failed: { label: "Failed", className: "bg-destructive/10 text-destructive" },
};
/** Null means unavailable, never 'no ingestion'. */
export function IngestionStatus({
  state,
  skippedCount,
}: {
  state: IngestionState | null;
  skippedCount: number | undefined;
}) {
  if (
    !state ||
    typeof skippedCount !== "number" ||
    !Number.isSafeInteger(skippedCount) ||
    skippedCount < 0
  )
    return <span className="text-sm text-muted-foreground">Status unavailable</span>;
  // Sprint 1 persists usable results with skipped records as a succeeded attempt.
  const status =
    state === "succeeded" && skippedCount > 0
      ? { label: "Partially ingested", className: "bg-warning/10 text-warning" }
      : STATES[state];
  return (
    <span
      className={cn("inline-flex rounded-full px-2 py-1 text-xs font-medium", status.className)}
    >
      {status.label}
    </span>
  );
}
