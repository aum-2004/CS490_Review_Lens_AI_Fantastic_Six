import { fireEvent, render, screen, within } from "@testing-library/react";
import { SupportingReviews } from "@/components/reviews/SupportingReviews";
import type { Citation } from "@/lib/qa/citations";

const citations: Citation[] = Array.from({ length: 6 }, (_, index) => ({
  number: index + 1,
  label: `[${index + 1}]`,
  review: {
    id: `review-${index + 1}`,
    analysisTargetId: "target-a",
    rating: (index % 5) + 1,
    text: `Persisted supporting review ${index + 1}.`,
    reviewDate: index === 4 ? null : "2026-10-01T12:00:00Z",
  },
}));

it("renders nothing when there are no cited reviews", () => {
  const { container } = render(<SupportingReviews citations={[]} />);
  expect(container).toBeEmptyDOMElement();
});

it("shows every cited review without an expander when the set fits inline", () => {
  const { container } = render(<SupportingReviews citations={citations.slice(0, 3)} />);
  expect(within(screen.getByRole("list")).getAllByRole("listitem")).toHaveLength(3);
  expect(container.querySelector("details")).toBeNull();
  expect(screen.getByText(/not the complete saved review dataset/)).toBeInTheDocument();
});

it("offers the entire cited set beyond the inline sample, preserving numbering, text and metadata", () => {
  const { container } = render(<SupportingReviews citations={citations} />);
  const preview = screen.getByRole("list", { name: "Supporting Reviews" });
  expect(within(preview).getAllByRole("listitem")).toHaveLength(3);
  expect(preview).not.toHaveTextContent("Persisted supporting review 4.");
  const details = container.querySelector("details")!;
  expect(details).not.toHaveAttribute("open");
  fireEvent.click(screen.getByText("View all 6 supporting reviews"));
  expect(details).toHaveAttribute("open");
  const all = screen.getByRole("list", { name: "All supporting reviews" });
  const items = within(all).getAllByRole("listitem");
  expect(items).toHaveLength(6);
  citations.forEach((citation, index) => {
    expect(items[index]).toHaveTextContent(citation.label);
    expect(items[index]).toHaveTextContent(citation.review!.text);
    expect(items[index]).toHaveTextContent(`${citation.review!.rating} out of 5`);
    expect(items[index].querySelector("time")?.getAttribute("datetime") ?? null).toBe(
      citation.review!.reviewDate,
    );
  });
  fireEvent.click(screen.getByText("View all 6 supporting reviews"));
  expect(details).not.toHaveAttribute("open");
});

it("retains unavailable citation slots without inventing review text or dates", () => {
  render(
    <SupportingReviews
      citations={citations.map((citation, index) =>
        index === 3 ? { ...citation, review: null } : citation,
      )}
    />,
  );
  fireEvent.click(screen.getByText("View all 6 supporting reviews"));
  const item = within(screen.getByRole("list", { name: "All supporting reviews" })).getAllByRole(
    "listitem",
  )[3];
  expect(item).toHaveTextContent("[4] Review not available");
  expect(item).not.toHaveTextContent("Persisted supporting review 4.");
  expect(item.querySelector("time")).toBeNull();
});

it("renders expanded review text as inert text and preserves safe line-break formatting", () => {
  const attack = '<img src=x onerror="window.__s3014=1"><script>alert(1)</script>';
  const { container } = render(
    <SupportingReviews
      citations={citations.map((citation, index) =>
        index === 5
          ? { ...citation, review: { ...citation.review!, text: `First<br>Second ${attack}` } }
          : citation,
      )}
    />,
  );
  fireEvent.click(screen.getByText("View all 6 supporting reviews"));
  const all = screen.getByRole("list", { name: "All supporting reviews" });
  expect(all).toHaveTextContent(attack);
  expect(all.textContent).toContain("First\nSecond");
  expect(container.querySelector("img, script, br")).toBeNull();
});
