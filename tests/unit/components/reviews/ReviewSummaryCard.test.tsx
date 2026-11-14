import { render, screen } from "@testing-library/react";

import { ReviewSummaryCard } from "@/components/reviews/ReviewSummaryCard";
import type { ReviewSummary } from "@/services/reviews/review-summary";

function summary(overrides: Partial<ReviewSummary> = {}): ReviewSummary {
  return {
    targetId: "target-a",
    reviewCount: 3,
    averageRating: 4.333333,
    ingestionStatus: "succeeded",
    skippedCount: 1,
    ...overrides,
  };
}

it("renders persisted count, average, ingestion status, and skipped count", () => {
  render(<ReviewSummaryCard summary={summary()} />);

  expect(screen.getByRole("heading", { name: "Review summary" })).toBeInTheDocument();
  expect(screen.getByText("3")).toBeInTheDocument();
  expect(screen.getByText("4.3 / 5")).toBeInTheDocument();
  expect(screen.getByText("Partially ingested")).toBeInTheDocument();
  expect(screen.getByText("1")).toBeInTheDocument();
});

it("explains empty ratings and unavailable ingestion details", () => {
  render(
    <ReviewSummaryCard
      summary={summary({
        reviewCount: 0,
        averageRating: null,
        ingestionStatus: null,
        skippedCount: null,
      })}
    />,
  );

  expect(screen.getByText("No ratings yet")).toBeInTheDocument();
  expect(screen.getByText("Status unavailable")).toBeInTheDocument();
  expect(screen.getByText("Unavailable")).toBeInTheDocument();
});

it.each([
  ["partially ingested", "succeeded" as const, 1, "Partially ingested"],
  ["fully ingested", "succeeded" as const, 0, "Ingested"],
  ["missing ingestion state", null, null, "Status unavailable"],
  ["missing skipped count", "succeeded" as const, null, "Status unavailable"],
])(
  "renders the correct ingestion label for %s",
  (_caseName, ingestionStatus, skippedCount, label) => {
    render(
      <ReviewSummaryCard
        summary={summary({
          ingestionStatus,
          skippedCount,
        })}
      />,
    );

    expect(screen.getByText(label)).toBeInTheDocument();
  },
);
