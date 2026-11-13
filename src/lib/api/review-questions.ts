export type ReviewAnswer = {
  targetId: string;
  outcome: "answered" | "insufficient_evidence" | "out_of_scope";
  answer: string;
};

export class ReviewQuestionError extends Error {
  constructor(
    public readonly code: "AUTHENTICATION_REQUIRED" | "UNAVAILABLE" | "FAILED",
    message: string,
  ) {
    super(message);
    this.name = "ReviewQuestionError";
  }
}

/** Target-scoped integration contract; ownership must be enforced by the backend. */
export async function askReviewQuestion(
  targetId: string,
  question: string,
  signal: AbortSignal,
): Promise<ReviewAnswer> {
  let response: Response;
  try {
    response = await fetch(`/api/analysis-targets/${encodeURIComponent(targetId)}/questions`, {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question }),
      signal,
    });
  } catch {
    throw new ReviewQuestionError(
      "FAILED",
      signal.aborted
        ? "The question request was interrupted or took too long. Please try again."
        : "We couldn't reach ReviewLens. Check your connection and try again.",
    );
  }

  if (response.status === 401) {
    throw new ReviewQuestionError(
      "AUTHENTICATION_REQUIRED",
      "Please sign in again to ask questions.",
    );
  }
  if (response.status === 403 || response.status === 404) {
    throw new ReviewQuestionError(
      "UNAVAILABLE",
      "Questions are unavailable for this target. Return to My Targets or try again later.",
    );
  }
  if (!response.ok) {
    // Translate only known codes to local copy; never display arbitrary server text.
    const messages: Record<string, string> = {
      NO_REVIEW_DATA: "No saved reviews are available for this target. Complete ingestion first.",
      REVIEW_CONTEXT_TOO_LARGE:
        "This target's saved reviews exceed the supported Q&A size. Try another target.",
      REVIEW_CONTEXT_UNAVAILABLE:
        "We couldn't load the saved reviews for this question. Please try again.",
      REQUEST_TOO_LARGE:
        "This question is too long to analyze with these reviews. Try a shorter question.",
      QA_DISABLED: "Review Q&A is temporarily unavailable. Please try again later.",
      MODEL_TIMEOUT: "The answer took too long. Please try again.",
      MODEL_RATE_LIMITED: "Too many questions right now. Please try again shortly.",
    };
    let message: string | undefined;
    try {
      const payload = await response.json();
      const code: unknown = payload?.error?.code;
      if (typeof code === "string" && Object.hasOwn(messages, code)) message = messages[code];
    } catch {
      // A missing or unreadable error envelope uses the generic safe message.
    }
    throw new ReviewQuestionError(
      "FAILED",
      message ?? "ReviewLens couldn't answer your question. Please try again later.",
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    // Never show raw server/provider diagnostics.
  }
  if (
    typeof payload === "object" &&
    payload !== null &&
    "success" in payload &&
    payload.success === true &&
    "data" in payload
  ) {
    const data = payload.data;
    if (
      typeof data === "object" &&
      data !== null &&
      "targetId" in data &&
      data.targetId === targetId &&
      "outcome" in data &&
      ["answered", "insufficient_evidence", "out_of_scope"].includes(String(data.outcome)) &&
      "answer" in data &&
      typeof data.answer === "string" &&
      data.answer.trim()
    ) {
      return data as ReviewAnswer;
    }
  }
  throw new ReviewQuestionError(
    "FAILED",
    "ReviewLens returned an unexpected response. Please try again.",
  );
}
