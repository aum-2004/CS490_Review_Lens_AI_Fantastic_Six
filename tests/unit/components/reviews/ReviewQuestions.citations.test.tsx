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

const TARGET_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const TARGET_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2";
const A1 = "a1a1a1a1-0000-4000-8000-000000000001";
const A2 = "a2a2a2a2-0000-4000-8000-000000000002";
const B1 = "b1b1b1b1-0000-4000-8000-000000000003";
const UNCITED = "cccccccc-0000-4000-8000-000000000004";
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

const reviewsA: CitableReview[] = [
  {
    id: A1,
    analysisTargetId: TARGET_A,
    rating: 5,
    text: "Crusty bread.",
    reviewDate: "2026-10-01",
  },
  { id: A2, analysisTargetId: TARGET_A, rating: 3, text: "Slow line.", reviewDate: null },
];
const reviewsB: CitableReview[] = [
  {
    id: B1,
    analysisTargetId: TARGET_B,
    rating: 1,
    text: "TARGET_B_PRIVATE_TEXT",
    reviewDate: null,
  },
];
const props = {
  userId: "user-a",
  targetId: TARGET_A,
  targetName: "Bakery",
  reviewsAvailable: true,
  reviews: reviewsA,
};
const answered: ReviewAnswer = {
  targetId: TARGET_A,
  outcome: "answered",
  answer: `Reviewers love the bread [${A1}] but mention waits (${A2.toUpperCase()}).`,
  citedReviewIds: [A1, A2],
};

function submit(question = "What do reviewers like?") {
  fireEvent.change(screen.getByLabelText(/Question/), { target: { value: question } });
  fireEvent.click(screen.getByRole("button", { name: "Ask question" }));
}
const status = () => screen.getByRole("status");

beforeEach(() => {
  ask.mockReset();
  ask.mockResolvedValue(answered);
});

it("shows numbered citations and supporting reviews instead of raw UUIDs", async () => {
  render(<ReviewQuestions {...props} />);
  submit();
  expect(
    await screen.findByText("Reviewers love the bread [1] but mention waits [2]."),
  ).toBeInTheDocument();
  const list = screen.getByRole("list", { name: "Supporting Reviews" });
  const items = within(list).getAllByRole("listitem");
  expect(items).toHaveLength(2);
  expect(items[0]).toHaveTextContent("[1] 5 out of 5");
  expect(items[0]).toHaveTextContent("Crusty bread.");
  expect(items[0]).toHaveTextContent("2026-10-01");
  expect(items[1]).toHaveTextContent("[2] 3 out of 5");
  expect(items[1]).toHaveTextContent("Slow line.");
  expect(screen.getByRole("heading", { name: "Supporting Reviews" })).toBeInTheDocument();
  expect(status().textContent).not.toMatch(UUID);
  expect(document.body.innerHTML).not.toMatch(UUID);
});

it("shows 'Review not available' for a validated ID that is not loaded, never the UUID", async () => {
  ask.mockResolvedValueOnce({
    ...answered,
    answer: `Mentioned in ${UNCITED.replace("cccccccc", "dddddddd")}.`,
    citedReviewIds: [A1, UNCITED.replace("cccccccc", "dddddddd")],
  });
  render(<ReviewQuestions {...props} />);
  submit();
  expect(await screen.findByText("Mentioned in [2].")).toBeInTheDocument();
  const items = within(screen.getByRole("list", { name: "Supporting Reviews" })).getAllByRole(
    "listitem",
  );
  expect(items[1]).toHaveTextContent("[2] Review not available");
  expect(status().textContent).not.toMatch(UUID);
});

it("leaves an uncited UUID in the answer text untouched", async () => {
  ask.mockResolvedValueOnce({
    ...answered,
    answer: `Cited [${A1}]; order number ${UNCITED}.`,
    citedReviewIds: [A1],
  });
  render(<ReviewQuestions {...props} />);
  submit();
  expect(await screen.findByText(`Cited [1]; order number ${UNCITED}.`)).toBeInTheDocument();
});

it("does not show another target's review as evidence even if it was passed in", async () => {
  ask.mockResolvedValueOnce({ ...answered, answer: "Answer.", citedReviewIds: [B1] });
  render(<ReviewQuestions {...props} reviews={[...reviewsA, ...reviewsB]} />);
  submit();
  await screen.findByText("Answer.");
  expect(screen.getByRole("list", { name: "Supporting Reviews" })).toHaveTextContent(
    "[1] Review not available",
  );
  expect(screen.queryByText("TARGET_B_PRIVATE_TEXT")).not.toBeInTheDocument();
});

it("renders review and answer text as plain text", async () => {
  const script = '<script>window.__xss = 1</script><img src=x onerror="window.__xss=2">';
  ask.mockResolvedValueOnce({ ...answered, answer: `${script} [${A1}]`, citedReviewIds: [A1] });
  render(<ReviewQuestions {...props} reviews={[{ ...reviewsA[0], text: script }]} />);
  submit();
  expect(await screen.findByText(`${script} [1]`)).toBeInTheDocument();
  expect(screen.getByText(script)).toBeInTheDocument();
  expect(document.querySelector("script, img")).toBeNull();
  expect((window as unknown as { __xss?: number }).__xss).toBeUndefined();
});

it.each([
  ["insufficient_evidence", "Insufficient review evidence"],
  ["out_of_scope", "Outside the active reviews"],
] as const)("shows no Supporting Reviews for %s", async (outcome, heading) => {
  ask.mockResolvedValueOnce({
    targetId: TARGET_A,
    outcome,
    answer: "The reviews don't cover that.",
    citedReviewIds: [],
  });
  render(<ReviewQuestions {...props} />);
  submit();
  expect(await screen.findByRole("heading", { name: heading })).toBeInTheDocument();
  expect(screen.queryByText("Supporting Reviews")).not.toBeInTheDocument();
});

it("shows no Supporting Reviews for an answer without citations", async () => {
  ask.mockResolvedValueOnce({ ...answered, answer: "Answer.", citedReviewIds: [] });
  render(<ReviewQuestions {...props} />);
  submit();
  await screen.findByText("Answer.");
  expect(screen.queryByText("Supporting Reviews")).not.toBeInTheDocument();
});

it("never renders target A's late response or citations on target B", async () => {
  let resolveA!: (value: ReviewAnswer) => void;
  ask.mockReturnValueOnce(new Promise((done) => (resolveA = done)));
  const { rerender } = render(<ReviewQuestions {...props} />);
  submit();
  await waitFor(() => expect(ask).toHaveBeenCalledTimes(1));
  const signal = ask.mock.calls[0][2];
  rerender(<ReviewQuestions {...props} targetId={TARGET_B} targetName="Cafe" reviews={reviewsB} />);
  expect(signal.aborted).toBe(true);
  await act(async () => resolveA(answered));
  expect(screen.queryByText(/Reviewers love the bread/)).not.toBeInTheDocument();
  expect(screen.queryByText("Supporting Reviews")).not.toBeInTheDocument();
  expect(screen.queryByText("Crusty bread.")).not.toBeInTheDocument();
});

it("ignores a response whose targetId is not the active target", async () => {
  ask.mockResolvedValueOnce({ ...answered, targetId: TARGET_B });
  render(<ReviewQuestions {...props} />);
  submit();
  await waitFor(() => expect(screen.getByRole("button", { name: "Ask question" })).toBeEnabled());
  expect(screen.queryByText(/Reviewers love the bread/)).not.toBeInTheDocument();
  expect(screen.queryByText("Supporting Reviews")).not.toBeInTheDocument();
});

it.each([
  ["target", { targetId: TARGET_B, targetName: "Cafe", reviews: reviewsB }],
  ["account", { userId: "user-b" }],
])("clears citations and numbering when the %s changes", async (_label, change) => {
  const { rerender } = render(<ReviewQuestions {...props} />);
  submit();
  await screen.findByText("Supporting Reviews");
  rerender(<ReviewQuestions {...props} {...change} />);
  expect(screen.queryByText("Supporting Reviews")).not.toBeInTheDocument();
  expect(screen.queryByText(/\[1\]/)).not.toBeInTheDocument();
});

it("clears citations when a preserved page is hidden and restored", async () => {
  const view = (mode: "visible" | "hidden") => (
    <Activity mode={mode}>
      <ReviewQuestions {...props} />
    </Activity>
  );
  const { rerender } = render(view("visible"));
  submit();
  await screen.findByText("Supporting Reviews");
  rerender(view("hidden"));
  rerender(view("visible"));
  expect(screen.queryByText("Supporting Reviews")).not.toBeInTheDocument();
});
