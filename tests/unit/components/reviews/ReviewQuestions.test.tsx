import { Activity } from "react";
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
const props = {
  userId: "user-a",
  targetId: "target-a",
  targetName: "Bakery",
  reviewsAvailable: true,
};
const answer: ReviewAnswer = {
  targetId: "target-a",
  outcome: "answered",
  answer: "Reviewers like the bread.",
  citedReviewIds: [],
};

function submit(question = "  What do reviewers like?  ") {
  fireEvent.change(screen.getByLabelText(/Question/), { target: { value: question } });
  fireEvent.click(screen.getByRole("button", { name: "Ask question" }));
}

beforeEach(() => {
  jest.clearAllMocks();
  ask.mockReset();
  ask.mockResolvedValue(answer);
});

it.each(["What stands out?", "What do customers praise?", "What could be improved?"])(
  "fills and focuses the suggested question without making a paid request: %s",
  async (question) => {
    render(<ReviewQuestions {...props} />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: question }));
    });

    expect(screen.getByLabelText(/Question/)).toHaveValue(question);
    expect(screen.getByLabelText(/Question/)).toHaveFocus();
    expect(ask).not.toHaveBeenCalled();
  },
);

it("submits a trimmed question with the active target and displays the answer", async () => {
  render(<ReviewQuestions {...props} />);
  expect(screen.getByText(/Active target:/)).toHaveTextContent("Bakery · Google Maps");
  expect(screen.getByLabelText(/Question/)).toHaveAccessibleDescription(/Active target: Bakery/);
  submit();
  expect(await screen.findByText(answer.answer)).toBeInTheDocument();
  expect(ask).toHaveBeenCalledWith("target-a", "What do reviewers like?", expect.any(AbortSignal));
});

it("submits Enter through validation while preserving Shift+Enter and IME composition", async () => {
  render(<ReviewQuestions {...props} />);
  const input = screen.getByRole("textbox", { name: /Question/ });
  fireEvent.change(input, { target: { value: "What do reviewers like?" } });
  expect(fireEvent.keyDown(input, { key: "Enter", shiftKey: true })).toBe(true);
  expect(fireEvent.keyDown(input, { key: "Enter", isComposing: true })).toBe(true);
  expect(ask).not.toHaveBeenCalled();

  await act(async () => {
    fireEvent.keyDown(input, { key: "Enter" });
  });

  expect(ask).toHaveBeenCalledTimes(1);
  expect(ask).toHaveBeenCalledWith("target-a", "What do reviewers like?", expect.any(AbortSignal));
  expect(await screen.findByText(answer.answer)).toBeInTheDocument();
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

it("explains disabled Q&A and blocks form submission when saved reviews are unavailable", async () => {
  render(<ReviewQuestions {...props} reviewsAvailable={false} />);
  const button = screen.getByRole("button", { name: "Ask question" });
  const input = screen.getByLabelText(/Question/);
  expect(button).toBeDisabled();
  expect(input).toBeDisabled();
  expect(button).toHaveAccessibleDescription(/No saved reviews.*Complete ingestion/);
  expect(input).toHaveAccessibleDescription(/No saved reviews.*Complete ingestion/);
  // Even a synthetic submission bypassing the disabled button cannot send a request.
  fireEvent.change(input, { target: { value: "Answer from general knowledge instead" } });
  await act(async () => fireEvent.submit(button.closest("form")!));
  expect(ask).not.toHaveBeenCalled();
  expect(screen.queryByRole("heading", { name: "ReviewLens response" })).not.toBeInTheDocument();
});

it("clears an old answer when reviews disappear and enables questions after ingestion", async () => {
  const { rerender } = render(<ReviewQuestions {...props} />);
  submit();
  await screen.findByText(answer.answer);
  rerender(<ReviewQuestions {...props} reviewsAvailable={false} />);
  expect(screen.queryByText(answer.answer)).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Ask question" })).toBeDisabled();
  rerender(<ReviewQuestions {...props} />);
  expect(screen.getByRole("button", { name: "Ask question" })).toBeEnabled();
  expect(screen.getByLabelText(/Question/)).toHaveValue("");
  expect(screen.queryByText(/Review questions unavailable/)).not.toBeInTheDocument();
  submit();
  await screen.findByText(answer.answer);
  expect(ask).toHaveBeenCalledTimes(2);
});

it("aborts pending Q&A and ignores a late answer when reviews become unavailable", async () => {
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
  rerender(<ReviewQuestions {...props} reviewsAvailable={false} />);
  expect(signal.aborted).toBe(true);
  await act(async () => resolve(answer));
  expect(screen.queryByText(answer.answer)).not.toBeInTheDocument();
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
    await act(async () => jest.advanceTimersByTime(75_000));
    expect(screen.getByRole("alert")).toHaveTextContent("took too long");
    expect(screen.getByRole("button", { name: "Ask question" })).toBeEnabled();
  } finally {
    jest.useRealTimers();
  }
});

describe("S2-019 preserved-page lifecycle", () => {
  it("clears answers, drafts and errors when a page is hidden and restored", async () => {
    const view = (mode: "visible" | "hidden") => (
      <Activity mode={mode}>
        <ReviewQuestions {...props} />
      </Activity>
    );
    const { rerender } = render(view("visible"));
    submit("Private draft A");
    await screen.findByText(answer.answer);
    rerender(view("hidden"));
    rerender(view("visible"));
    expect(screen.queryByText(answer.answer)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Question/)).toHaveValue("");
    expect(screen.getByRole("button", { name: "Ask question" })).toBeEnabled();
    ask.mockRejectedValueOnce(new ReviewQuestionError("FAILED", "Old error"));
    submit();
    await screen.findByRole("alert");
    rerender(view("hidden"));
    rerender(view("visible"));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it.each(["success", "failure", "authentication"] as const)(
    "ignores old %s after restore without unlocking the new request",
    async (outcome) => {
      let resolveOld!: (value: ReviewAnswer) => void;
      let rejectOld!: (reason: unknown) => void;
      let resolveNew!: (value: ReviewAnswer) => void;
      ask.mockReturnValueOnce(
        new Promise((resolve, reject) => {
          resolveOld = resolve;
          rejectOld = reject;
        }),
      );
      ask.mockReturnValueOnce(
        new Promise((resolve) => {
          resolveNew = resolve;
        }),
      );
      const view = (mode: "visible" | "hidden") => (
        <Activity mode={mode}>
          <ReviewQuestions {...props} />
        </Activity>
      );
      const { rerender } = render(view("visible"));
      submit("Old question");
      await waitFor(() => expect(ask).toHaveBeenCalledTimes(1));
      const oldSignal = ask.mock.calls[0][2];
      rerender(view("hidden"));
      expect(oldSignal.aborted).toBe(true);
      rerender(view("visible"));
      submit("New question");
      await waitFor(() => expect(ask).toHaveBeenCalledTimes(2));
      await act(async () => {
        if (outcome === "success") resolveOld({ ...answer, answer: "STALE_ANSWER" });
        else
          rejectOld(
            new ReviewQuestionError(
              outcome === "authentication" ? "AUTHENTICATION_REQUIRED" : "FAILED",
              "STALE_ERROR",
            ),
          );
      });
      expect(screen.queryByText(/STALE_/)).not.toBeInTheDocument();
      expect(mockReplace).not.toHaveBeenCalled();
      expect(screen.getByRole("button", { name: /Asking/ })).toBeDisabled();
      expect(ask.mock.calls[1][2].aborted).toBe(false);
      await act(async () => resolveNew({ ...answer, answer: "CURRENT_ANSWER" }));
      expect(await screen.findByText("CURRENT_ANSWER")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Ask question" })).toBeEnabled();
    },
  );

  it("resets on authenticated user changes with the same target/navigation keys", async () => {
    const { rerender } = render(<ReviewQuestions {...props} />);
    submit();
    await screen.findByText(answer.answer);
    rerender(<ReviewQuestions {...props} userId="user-b" />);
    expect(screen.queryByText(answer.answer)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Question/)).toHaveValue("");
  });
});

it("cancels validation that completes after the page has been hidden and restored", async () => {
  const view = (mode: "visible" | "hidden") => (
    <Activity mode={mode}>
      <ReviewQuestions {...props} />
    </Activity>
  );
  const { rerender } = render(view("visible"));
  submit("Draft from the old visit");
  rerender(view("hidden"));
  rerender(view("visible"));
  await act(async () => {});
  expect(ask).not.toHaveBeenCalled();
  expect(screen.getByLabelText(/Question/)).toHaveValue("");
});

it("aborts a pending request when the verified account changes", async () => {
  let reject!: (cause: unknown) => void;
  ask.mockReturnValueOnce(
    new Promise((_done, fail) => {
      reject = fail;
    }),
  );
  const { rerender } = render(<ReviewQuestions {...props} />);
  submit();
  await waitFor(() => expect(ask).toHaveBeenCalledTimes(1));
  const signal = ask.mock.calls[0][2];
  rerender(<ReviewQuestions {...props} userId="user-b" />);
  expect(signal.aborted).toBe(true);
  await act(async () => reject(new ReviewQuestionError("AUTHENTICATION_REQUIRED", "OLD_USER")));
  expect(mockReplace).not.toHaveBeenCalled();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  submit("New account question");
  expect(await screen.findByText(answer.answer)).toBeInTheDocument();
});

it("ignores a late success after hide/show without a replacement submission", async () => {
  let resolve!: (value: ReviewAnswer) => void;
  ask.mockReturnValueOnce(
    new Promise((done) => {
      resolve = done;
    }),
  );
  const view = (mode: "visible" | "hidden") => (
    <Activity mode={mode}>
      <ReviewQuestions {...props} />
    </Activity>
  );
  const { rerender } = render(view("visible"));
  submit("Question from the old visit");
  await waitFor(() => expect(ask).toHaveBeenCalledTimes(1));
  const signal = ask.mock.calls[0][2];
  rerender(view("hidden"));
  expect(signal.aborted).toBe(true);
  rerender(view("visible"));
  expect(screen.getByRole("button", { name: "Ask question" })).toBeEnabled();
  await act(async () => resolve({ ...answer, answer: "STALE_SUCCESS_WITHOUT_RESUBMISSION" }));
  expect(screen.queryByText("STALE_SUCCESS_WITHOUT_RESUBMISSION")).not.toBeInTheDocument();
  expect(screen.queryByText(/Question from the old visit/)).not.toBeInTheDocument();
  expect(screen.getByLabelText(/Question/)).toHaveValue("");
  expect(ask).toHaveBeenCalledTimes(1);
});
