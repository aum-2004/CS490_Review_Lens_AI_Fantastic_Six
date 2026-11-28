import { fireEvent, render, screen, within } from "@testing-library/react";
import { ReviewBrowser } from "@/components/reviews/ReviewBrowser";
import type { Review } from "@/services/reviews/review-service";

function makeReview(
  id: string,
  rating: number,
  date: string | null,
  targetId = "target-a",
): Review {
  return {
    id,
    analysisTargetId: targetId,
    text: `Review ${id}`,
    rating,
    sourceReviewId: null,
    reviewerName: null,
    reviewDate: date,
    reviewUrl: null,
    sourceMetadata: null,
    createdAt: "2026-11-01T00:00:00Z",
  };
}

const targetAReviews = [
  makeReview("a-low", 2, "2026-06-01T12:00:00Z"),
  makeReview("a-high", 5, "2026-06-02T12:00:00Z"),
  makeReview("a-undated", 5, null),
];

describe("ReviewBrowser", () => {
  test("applies draft filters across preview, matching count, and complete browser", () => {
    render(<ReviewBrowser reviews={targetAReviews} />);
    fireEvent.change(screen.getByLabelText("Minimum rating"), { target: { value: "5" } });
    fireEvent.change(screen.getByLabelText("Start date"), { target: { value: "2026-06-02" } });
    expect(screen.getByText("3 matching reviews")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Apply filters" }));
    expect(screen.getByText("1 matching review")).toBeInTheDocument();
    expect(screen.getAllByText("Review a-high")).toHaveLength(2);
    expect(screen.queryByText("Review a-low")).not.toBeInTheDocument();
    expect(screen.queryByText("Review a-undated")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Active filters")).toHaveTextContent("Min rating: 5");
  });

  test("Cancel discards drafts while Clear all immediately restores the complete dataset", () => {
    render(<ReviewBrowser reviews={targetAReviews} />);
    fireEvent.change(screen.getByLabelText("Maximum rating"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply filters" }));
    expect(screen.getByText("1 matching review")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Minimum rating"), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("spinbutton", { name: "Minimum rating" })).toHaveAttribute("value", "");
    expect(screen.getAllByText("Review a-low")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Clear all" }));
    expect(screen.getByText("3 matching reviews")).toBeInTheDocument();
    expect(screen.queryByLabelText("Active filters")).not.toBeInTheDocument();
  });

  test("distinguishes zero matches from no saved reviews and resets applied filters on target switch", () => {
    const { rerender } = render(<ReviewBrowser reviews={targetAReviews} />);
    fireEvent.change(screen.getByLabelText("Minimum rating"), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText("Start date"), { target: { value: "2026-06-03" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply filters" }));
    expect(screen.getByText("No reviews match these filters.")).toBeInTheDocument();

    rerender(
      <ReviewBrowser key="target-b" reviews={[makeReview("b-review", 3, null, "target-b")]} />,
    );
    expect(screen.getByText("1 matching review")).toBeInTheDocument();
    expect(screen.getAllByText("Review b-review")).toHaveLength(2);
    expect(screen.queryByLabelText("Active filters")).not.toBeInTheDocument();

    rerender(<ReviewBrowser key="target-c" reviews={[]} />);
    expect(screen.getByText("No saved reviews yet.")).toBeInTheDocument();
    expect(screen.queryByText("No reviews match these filters.")).not.toBeInTheDocument();
  });

  test("keeps invalid draft bounds out of the applied dataset", () => {
    render(<ReviewBrowser reviews={targetAReviews} />);
    fireEvent.change(screen.getByLabelText("Minimum rating"), { target: { value: "5" } });
    fireEvent.change(screen.getByLabelText("Maximum rating"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply filters" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Ratings must be numbers");
    expect(screen.getByText("3 matching reviews")).toBeInTheDocument();
    expect(screen.queryByLabelText("Active filters")).not.toBeInTheDocument();
  });

  test("applies an end date inclusively and excludes undated reviews", () => {
    render(<ReviewBrowser reviews={targetAReviews} />);
    fireEvent.change(screen.getByLabelText("End date"), { target: { value: "2026-06-02" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply filters" }));
    expect(screen.getByText("2 matching reviews")).toBeInTheDocument();
    expect(screen.getAllByText("Review a-low")).toHaveLength(2);
    expect(screen.getAllByText("Review a-high")).toHaveLength(2);
    expect(screen.queryByText("Review a-undated")).not.toBeInTheDocument();
  });

  test("filters a dataset larger than the 1,000-review page size without truncating it", () => {
    const reviews = Array.from({ length: 1_205 }, (_, index) =>
      makeReview(`large-${index}`, index === 1_204 ? 5 : 3, "2026-06-01T12:00:00Z"),
    );
    render(<ReviewBrowser reviews={reviews} />);
    expect(screen.getByText("1205 matching reviews")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Minimum rating"), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply filters" }));
    expect(screen.getByText("1 matching review")).toBeInTheDocument();
    expect(screen.getAllByText("Review large-1204")).toHaveLength(2);
  });

  test("formats line-break markers consistently in the preview and complete review list", () => {
    const formatted = makeReview("formatted", 4, "2026-06-01T12:00:00Z");
    formatted.text = "First line<br>Second line";
    render(<ReviewBrowser reviews={[formatted]} />);
    expect(
      within(screen.getByRole("list", { name: "Review preview entries" })).getByText(
        /First line\s+Second line/,
      ),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("list", { name: "Saved reviews" })).getByText(
        /First line\s+Second line/,
      ),
    ).toBeInTheDocument();
  });
});
