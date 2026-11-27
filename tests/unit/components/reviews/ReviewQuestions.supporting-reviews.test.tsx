import { Activity } from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ReviewQuestions } from "@/components/reviews/ReviewQuestions";
import { askReviewQuestion, type ReviewAnswer } from "@/lib/api/review-questions";
import type { CitableReview } from "@/lib/qa/citations";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: jest.fn(), bfcacheId: "page" }),
}));
jest.mock("@/lib/api/review-questions", () => ({
  ...jest.requireActual("@/lib/api/review-questions"),
  askReviewQuestion: jest.fn(),
}));
const ask = jest.mocked(askReviewQuestion);
const reviews: CitableReview[] = Array.from({ length: 7 }, (_, index) => ({
  id: `a1000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
  analysisTargetId: "target-a",
  rating: 4,
  text: `Active persisted review ${index + 1}`,
  reviewDate: "2026-11-01",
}));
const foreign: CitableReview = {
  ...reviews[0],
  id: "b2000000-0000-4000-8000-000000000001",
  analysisTargetId: "target-b",
  text: "FOREIGN_PRIVATE_REVIEW",
};
const answer: ReviewAnswer = {
  targetId: "target-a",
  outcome: "answered",
  answer: `Supported finding [${reviews[0].id}].`,
  // Deliberately different from persisted order; the seventh active review is not cited.
  citedReviewIds: [reviews[4].id, reviews[0].id, reviews[3].id, reviews[1].id, reviews[5].id],
};
const props = {
  userId: "user-a",
  targetId: "target-a",
  targetName: "Alpha",
  reviewsAvailable: true,
  reviews: [...reviews, foreign],
};

async function submitAndWait() {
  fireEvent.change(screen.getByLabelText(/Question/), { target: { value: "What stands out?" } });
  fireEvent.click(screen.getByRole("button", { name: "Ask question" }));
  await screen.findByRole("heading", { name: "ReviewLens response" });
}

beforeEach(() => {
  ask.mockReset();
  ask.mockResolvedValue(answer);
});

it("opens only the complete cited subset in citation order, not every supplied review", async () => {
  render(<ReviewQuestions {...props} />);
  await submitAndWait();
  fireEvent.click(screen.getByText("View all 5 supporting reviews"));
  const all = screen.getByRole("list", { name: "All supporting reviews" });
  const items = within(all).getAllByRole("listitem");
  expect(items).toHaveLength(5);
  answer.citedReviewIds.forEach((id, index) => {
    expect(items[index]).toHaveTextContent(`[${index + 1}]`);
    expect(items[index]).toHaveTextContent(reviews.find((review) => review.id === id)!.text);
  });
  expect(all).not.toHaveTextContent(reviews[6].text);
  expect(all).not.toHaveTextContent(foreign.text);
  expect(all.textContent).not.toMatch(/[ab][12]000000-0000-4000-8000/);
  expect(ask).toHaveBeenCalledTimes(1);
});

it("never resolves a foreign-target citation even when that review is supplied", async () => {
  ask.mockResolvedValueOnce({
    ...answer,
    citedReviewIds: [...answer.citedReviewIds, foreign.id],
  });
  render(<ReviewQuestions {...props} />);
  await submitAndWait();
  fireEvent.click(screen.getByText("View all 6 supporting reviews"));
  const items = within(screen.getByRole("list", { name: "All supporting reviews" })).getAllByRole(
    "listitem",
  );
  expect(items[5]).toHaveTextContent("[6] Review not available");
  expect(document.body).not.toHaveTextContent(foreign.text);
});

it.each([
  ["target", { targetId: "target-b", targetName: "Beta", reviews: [foreign] }],
  ["account", { userId: "user-b", reviews: [] }],
])("clears an expanded cited set after a %s change", async (_label, change) => {
  const { rerender } = render(<ReviewQuestions {...props} />);
  await submitAndWait();
  fireEvent.click(screen.getByText("View all 5 supporting reviews"));
  rerender(<ReviewQuestions {...props} {...change} />);
  expect(screen.queryByText(/View all .* supporting reviews/)).not.toBeInTheDocument();
  expect(screen.queryByRole("list", { name: "All supporting reviews" })).not.toBeInTheDocument();
  expect(document.body).not.toHaveTextContent(reviews[4].text);
});

it("does not restore expanded evidence after a preserved page is hidden and shown", async () => {
  const view = (mode: "visible" | "hidden") => (
    <Activity mode={mode}>
      <ReviewQuestions {...props} />
    </Activity>
  );
  const { rerender } = render(view("visible"));
  await submitAndWait();
  fireEvent.click(screen.getByText("View all 5 supporting reviews"));
  rerender(view("hidden"));
  rerender(view("visible"));
  expect(screen.queryByText(/View all .* supporting reviews/)).not.toBeInTheDocument();
  expect(document.body).not.toHaveTextContent(reviews[4].text);
});

it("removes the previous expanded set while a new question is pending and on a non-answer", async () => {
  const { container } = render(<ReviewQuestions {...props} />);
  await submitAndWait();
  fireEvent.click(screen.getByText("View all 5 supporting reviews"));
  let resolve!: (value: ReviewAnswer) => void;
  ask.mockReturnValueOnce(new Promise((done) => (resolve = done)));
  fireEvent.click(screen.getByRole("button", { name: "Ask question" }));
  await waitFor(() => expect(ask).toHaveBeenCalledTimes(2));
  expect(container.querySelector("details")).toBeNull();
  await act(async () =>
    resolve({
      ...answer,
      outcome: "insufficient_evidence",
      answer: "Not enough evidence.",
      citedReviewIds: [],
    }),
  );
  expect(await screen.findByText("Not enough evidence.")).toBeInTheDocument();
  expect(container.querySelector("details")).toBeNull();
});
