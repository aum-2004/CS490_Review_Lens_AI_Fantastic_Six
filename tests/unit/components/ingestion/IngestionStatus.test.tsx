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
