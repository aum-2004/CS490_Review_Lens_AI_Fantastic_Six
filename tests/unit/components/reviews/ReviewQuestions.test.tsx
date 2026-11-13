import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ReviewQuestions } from "@/components/reviews/ReviewQuestions";
import {
  askReviewQuestion,
  ReviewQuestionError,
  type ReviewAnswer,
} from "@/lib/api/review-questions";

const mockReplace = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace, bfcacheId: "page" }),
}));
jest.mock("@/lib/api/review-questions", () => ({
  ...jest.requireActual("@/lib/api/review-questions"),
  askReviewQuestion: jest.fn(),
}));
const ask = jest.mocked(askReviewQuestion);
const props = { targetId: "target-a", targetName: "Bakery", reviewsAvailable: true };
const answer: ReviewAnswer = {
  targetId: "target-a",
  outcome: "answered",
  answer: "Reviewers like the bread.",
};

function submit(question = "  What do reviewers like?  ") {
  fireEvent.change(screen.getByLabelText(/Question/), { target: { value: question } });
  fireEvent.click(screen.getByRole("button", { name: "Ask question" }));
}

beforeEach(() => {
  jest.clearAllMocks();
  ask.mockResolvedValue(answer);
});

it("submits a trimmed question with the active target and displays the answer", async () => {
  render(<ReviewQuestions {...props} />);
  expect(screen.getByText(/Active target:/)).toHaveTextContent("Bakery · Google Maps");
  expect(screen.getByLabelText(/Question/)).toHaveAccessibleDescription(/Active target: Bakery/);
  submit();
  expect(await screen.findByText(answer.answer)).toBeInTheDocument();
  expect(ask).toHaveBeenCalledWith("target-a", "What do reviewers like?", expect.any(AbortSignal));
});

it.each(["   ", "x".repeat(2001)])(
  "rejects invalid input and focuses the field",
  async (question) => {
    render(<ReviewQuestions {...props} />);
    submit(question);
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByLabelText(/Question/)).toHaveAccessibleDescription(/Active target: Bakery/);
    expect(ask).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByLabelText(/Question/)).toHaveFocus());
  },
);

it("shows processing, prevents duplicate requests, and clears stale success on retry", async () => {
  render(<ReviewQuestions {...props} />);
  submit();
  await screen.findByText(answer.answer);
  let resolve!: (value: ReviewAnswer) => void;
  ask.mockReturnValueOnce(
    new Promise((done) => {
      resolve = done;
    }),
  );
  submit("What about service?");
  await screen.findByRole("button", { name: /Asking/ });
  expect(screen.queryByText(answer.answer)).not.toBeInTheDocument();
  expect(screen.getByText(/processing your question for Bakery/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /Asking/ }));
  expect(ask).toHaveBeenCalledTimes(2);
  await act(async () => resolve({ ...answer, answer: "Service is friendly." }));
  expect(await screen.findByText("Service is friendly.")).toBeInTheDocument();
});

it("preserves input after a failure and allows retry", async () => {
  ask.mockRejectedValueOnce(new ReviewQuestionError("FAILED", "Please try again later."));
  render(<ReviewQuestions {...props} />);
  submit();
  expect(await screen.findByRole("alert")).toHaveTextContent("Please try again later.");
  expect(screen.getByLabelText(/Question/)).toHaveValue("  What do reviewers like?  ");
  fireEvent.click(screen.getByRole("button", { name: "Ask question" }));
  expect(await screen.findByText(answer.answer)).toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it("maps safe server validation into the focused inline question error", async () => {
  const message = "Questions can be up to 2,000 characters.";
  ask.mockRejectedValueOnce(
    new ReviewQuestionError("FAILED", "Validation failed", { question: message }),
  );
  render(<ReviewQuestions {...props} />);
  submit();
  expect(await screen.findByRole("alert")).toHaveTextContent(message);
  await waitFor(() => expect(screen.getByLabelText(/Question/)).toHaveFocus());
  expect(screen.getByLabelText(/Question/)).toHaveAttribute("aria-invalid", "true");
  expect(screen.getByLabelText(/Question/)).toHaveValue("  What do reviewers like?  ");
});

it("redirects an expired session to sign in with the workspace return URL", async () => {
  ask.mockRejectedValueOnce(
    new ReviewQuestionError("AUTHENTICATION_REQUIRED", "Please sign in again."),
  );
  render(<ReviewQuestions {...props} />);
  submit();
  await waitFor(() =>
    expect(mockReplace).toHaveBeenCalledWith("/login?next=%2Fanalysis-targets%2Ftarget-a"),
  );
});

it("explains disabled Q&A when saved reviews are unavailable", () => {
  render(<ReviewQuestions {...props} reviewsAvailable={false} />);
  expect(screen.getByRole("button", { name: "Ask question" })).toBeDisabled();
  expect(screen.getByText(/Saved reviews must be available/)).toBeInTheDocument();
});

it.each([
  ["insufficient_evidence", "Insufficient review evidence"],
  ["out_of_scope", "Outside the active reviews"],
] as const)("distinguishes %s from service failure", async (outcome, label) => {
  ask.mockResolvedValueOnce({ ...answer, outcome });
  render(<ReviewQuestions {...props} />);
  submit();
  expect(await screen.findByRole("heading", { name: label })).toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it("aborts a pending old-target request and ignores its late answer", async () => {
  let resolve!: (value: ReviewAnswer) => void;
  ask.mockReturnValueOnce(
    new Promise((done) => {
      resolve = done;
    }),
  );
  const { rerender } = render(<ReviewQuestions {...props} />);
  submit();
  await waitFor(() => expect(ask).toHaveBeenCalledTimes(1));
  const signal = ask.mock.calls[0][2];
  rerender(<ReviewQuestions {...props} targetId="target-b" targetName="Cafe" />);
  expect(signal.aborted).toBe(true);
  await act(async () => resolve(answer));
  expect(screen.queryByText(answer.answer)).not.toBeInTheDocument();
  expect(screen.getByLabelText(/Question/)).toHaveValue("");
  submit("What do cafe reviewers like?");
  await waitFor(() => expect(ask.mock.calls[1][0]).toBe("target-b"));
});

it("bounds request duration and presents a retryable timeout", async () => {
  jest.useFakeTimers();
  ask.mockImplementationOnce(
    (_target, _question, signal) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () =>
          reject(new ReviewQuestionError("FAILED", "The request took too long. Please try again.")),
        );
      }),
  );
  try {
    render(<ReviewQuestions {...props} />);
    await act(async () => submit());
    await act(async () => jest.advanceTimersByTime(30_000));
    expect(screen.getByRole("alert")).toHaveTextContent("took too long");
    expect(screen.getByRole("button", { name: "Ask question" })).toBeEnabled();
  } finally {
    jest.useRealTimers();
  }
});
