import { cn } from "@/lib/utils/cn";
import type { IngestionState } from "@/services/ingestion/ingestion-state";

const STATES: Record<IngestionState, { label: string; className: string }> = {
  not_ingested: { label: "Not ingested", className: "bg-muted text-muted-foreground" },
  processing: { label: "Ingesting", className: "bg-info/10 text-info" },
  succeeded: { label: "Ingested", className: "bg-success/10 text-success" },
  failed: { label: "Failed", className: "bg-destructive/10 text-destructive" },
};
/** Null means unavailable, never 'no ingestion'. */
export function IngestionStatus({ state }: { state: IngestionState | null }) {
  if (!state) return <span className="text-sm text-muted-foreground">Status unavailable</span>;
  const status = STATES[state];
  return (
    <span
      className={cn("inline-flex rounded-full px-2 py-1 text-xs font-medium", status.className)}
    >
      {status.label}
    </span>
  );
}
