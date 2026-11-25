import { render, screen, within } from "@testing-library/react";

import { ReviewList } from "@/components/reviews/ReviewList";
import type { Review } from "@/services/reviews/review-service";

const COMPLETE_DATASET_SIZE = 1_001;

function reviewAt(index: number, overrides: Partial<Review> = {}): Review {
  return {
    id: `review-${index}`,
    analysisTargetId: "target-a",
    text: `Complete persisted review ${index}`,
    rating: (index % 5) + 1,
    sourceReviewId: `source-${index}`,
    reviewerName: null,
    reviewDate: null,
    reviewUrl: null,
    sourceMetadata: null,
    createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString(),
    ...overrides,
  };
}

describe("ReviewList (S3-015)", () => {
  test("renders every review in a dataset larger than one backend page without truncating text", () => {
    const completeText = `First line\n${"Complete review text. ".repeat(40)}Final line`;
    const reviews = Array.from({ length: COMPLETE_DATASET_SIZE }, (_, index) => reviewAt(index));
    reviews[0] = reviewAt(0, {
      text: completeText,
      rating: 4.5,
      reviewerName: "Sam Reviewer",
      reviewDate: "2026-10-01T12:34:56.000Z",
    });

    render(<ReviewList reviews={reviews} />);

    const list = screen.getByRole("list", { name: "Saved reviews" });
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(COMPLETE_DATASET_SIZE);

    const first = within(items[0]);
    expect(first.getByText("4.5 out of 5")).toBeInTheDocument();
    expect(first.getByText(completeText, { collapseWhitespace: false })).toBeInTheDocument();
    expect(first.getByText("Sam Reviewer")).toBeInTheDocument();
    expect(first.getByText("2026-10-01").closest("time")).toHaveAttribute(
      "datetime",
      "2026-10-01T12:34:56.000Z",
    );

    expect(within(items.at(-1)!).getByText("Complete persisted review 1000")).toBeInTheDocument();
  });

  test("omits unavailable optional metadata without fabricating replacement values", () => {
    render(<ReviewList reviews={[reviewAt(1)]} />);

    const item = screen.getByRole("listitem");
    expect(within(item).getByText("2 out of 5")).toBeInTheDocument();
    expect(within(item).getByText("Complete persisted review 1")).toBeInTheDocument();
    expect(item.querySelector("time")).toBeNull();
    expect(item).not.toHaveTextContent(/anonymous|unknown|date unavailable/i);
  });

  test("shows a meaningful empty state instead of an empty review list", () => {
    render(<ReviewList reviews={[]} />);

    expect(screen.getByText("No saved reviews yet.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View ingestion status" })).toHaveAttribute(
      "href",
      "#ingestion",
    );
    expect(screen.queryByRole("list", { name: "Saved reviews" })).not.toBeInTheDocument();
  });
});
