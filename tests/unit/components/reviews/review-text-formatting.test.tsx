import { render, screen, within } from "@testing-library/react";

import { ReviewList } from "@/components/reviews/ReviewList";
import { SupportingReviews } from "@/components/reviews/SupportingReviews";
import type { Citation } from "@/lib/qa/citations";
import { formatReviewText } from "@/lib/reviews/format-review-text";
import type { Review } from "@/services/reviews/review-service";

const review: Review = {
  id: "review-1",
  analysisTargetId: "target-1",
  text: "First<br>Second<BR/>Third<Br />Fourth",
  rating: 5,
  sourceReviewId: null,
  reviewerName: null,
  reviewDate: null,
  reviewUrl: null,
  sourceMetadata: null,
  createdAt: "2026-11-20T00:00:00.000Z",
};

it.each([
  ["multiple breaks", "First<br>Second<br/>Third", "First\nSecond\nThird"],
  ["case variations", "First<BR>Second<Br/>Third<bR />Fourth", "First\nSecond\nThird\nFourth"],
  ["ordinary text", "Friendly service and good coffee.", "Friendly service and good coffee."],
])("formats %s", (_caseName, input, expected) => {
  expect(formatReviewText(input)).toBe(expected);
});

it("formats review text in the saved review list", () => {
  render(<ReviewList reviews={[review]} />);

  const item = within(screen.getByRole("list", { name: "Saved reviews" })).getByRole("listitem");
  expect(item.querySelectorAll("p")[1]).toHaveTextContent("First\nSecond\nThird\nFourth", {
    normalizeWhitespace: false,
  });
});

it("formats review text in supporting reviews", () => {
  const citations: Citation[] = [
    {
      number: 1,
      label: "[1]",
      review: {
        id: review.id,
        analysisTargetId: review.analysisTargetId,
        rating: review.rating,
        text: review.text,
        reviewDate: review.reviewDate,
      },
    },
  ];

  render(<SupportingReviews citations={citations} />);

  const item = within(screen.getByRole("list", { name: "Supporting Reviews" })).getByRole(
    "listitem",
  );
  expect(item.querySelectorAll("p")[1]).toHaveTextContent("First\nSecond\nThird\nFourth", {
    normalizeWhitespace: false,
  });
});

it("keeps malicious HTML as escaped plain text while converting line breaks", () => {
  const malicious = '<script>window.__xss = 1</script><br><img src=x onerror="window.__xss=2">';

  render(<ReviewList reviews={[{ ...review, text: malicious }]} />);

  const item = within(screen.getByRole("list", { name: "Saved reviews" })).getByRole("listitem");
  expect(item.querySelectorAll("p")[1]).toHaveTextContent(
    '<script>window.__xss = 1</script>\n<img src=x onerror="window.__xss=2">',
    { normalizeWhitespace: false },
  );
  expect(document.querySelector("script, img")).toBeNull();
  expect(document.body.innerHTML).toContain("&lt;script&gt;");
  expect((window as unknown as { __xss?: number }).__xss).toBeUndefined();
});
