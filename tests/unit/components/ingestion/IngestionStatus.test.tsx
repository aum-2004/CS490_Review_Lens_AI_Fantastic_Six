import { render, screen } from "@testing-library/react";
import { IngestionStatus } from "@/components/ingestion/IngestionStatus";
import { TargetCard } from "@/components/analysis-targets/TargetCard";
import { NO_INGESTION, type IngestionState } from "@/services/ingestion/ingestion-state";

it.each<[IngestionState | null, number, string]>([
  [null, 2, "Status unavailable"],
  ["not_ingested", 0, "Not ingested"],
  ["processing", 2, "Ingesting"],
  ["succeeded", 0, "Ingested"],
  ["succeeded", 2, "Partially ingested"],
  ["failed", 2, "Failed"],
])("labels persisted %s with %i skipped records as %s", (state, skippedCount, label) => {
  render(<IngestionStatus state={state} skippedCount={skippedCount} />);
  expect(screen.getByText(label, { exact: true })).toBeInTheDocument();
});

it("uses the same partial result badge on the target card", () => {
  render(
    <TargetCard
      target={{
        id: "target-a",
        name: "Bakery",
        platform: "google_maps",
        sourceUrl: "https://www.google.com/maps/place/Bakery",
        createdAt: "2026-11-01T00:00:00Z",
        ingestion: { ...NO_INGESTION, state: "succeeded", savedCount: 3, skippedCount: 2 },
      }}
    />,
  );
  expect(screen.getByText("Partially ingested")).toBeInTheDocument();
  expect(screen.queryByText("Ingested", { exact: true })).not.toBeInTheDocument();
});

it.each([undefined, null, -1, NaN, Infinity, -Infinity, 0.5])(
  "shows unavailable instead of success for an invalid skipped count (%s)",
  (skippedCount) => {
    // Exercise malformed runtime data as well as the required TypeScript prop.
    render(<IngestionStatus state="succeeded" skippedCount={skippedCount as number | undefined} />);
    expect(screen.getByText("Status unavailable")).toBeInTheDocument();
    expect(screen.queryByText("Ingested", { exact: true })).not.toBeInTheDocument();
    expect(screen.queryByText("Partially ingested")).not.toBeInTheDocument();
  },
);

it("requires skippedCount and safely handles a caller that omits it at runtime", () => {
  // @ts-expect-error skippedCount is required even when the caller has no count.
  render(<IngestionStatus state="succeeded" />);
  expect(screen.getByText("Status unavailable")).toBeInTheDocument();
});

it("uses an amber warning token for partial completion and blue info for processing", () => {
  const { rerender } = render(<IngestionStatus state="succeeded" skippedCount={2} />);
  expect(screen.getByText("Partially ingested")).toHaveClass("bg-warning/10", "text-warning");
  rerender(<IngestionStatus state="processing" skippedCount={0} />);
  expect(screen.getByText("Ingesting")).toHaveClass("bg-info/10", "text-info");
});
