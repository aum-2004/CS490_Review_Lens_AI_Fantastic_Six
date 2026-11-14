/** @jest-environment node */

import { TargetNotFoundError } from "@/services/analysis-targets/target-ownership";
import { buildInputTokenCountBody, buildOpenAiRequestBody } from "@/services/qa/openai-qa-client";
import {
  runGroundedQaRequest,
  toPromptContext,
  type QaReviewContextBuilder,
} from "@/services/qa/qa-request";
import {
  QA_RESERVED_OUTPUT_TOKENS,
  QaPromptError,
  buildSystemPrompt,
  type QaModelRequest,
} from "@/services/qa/system-prompt";
import { assertCountableSize } from "@/services/qa/token-budget";

jest.mock("server-only", () => ({}));

/*
 * Stand-ins mirroring S2-010 (PR #78, src/services/qa/review-context.ts) so this suite does not
 * depend on the unmerged module. Once #78 merges, replace them with imports of
 * ReviewDatasetContext, ReviewContextError, MAX_CONTEXT_REVIEWS, and MAX_CONTEXT_EVIDENCE_BYTES.
 */
const S2010_MAX_CONTEXT_REVIEWS = 100;
const S2010_MAX_CONTEXT_EVIDENCE_BYTES = 32_768;

type S2010ReviewContextErrorCode =
  | "AUTH_REQUIRED"
  | "AUTH_UNAVAILABLE"
  | "NO_REVIEW_DATA"
  | "REVIEW_CONTEXT_TOO_LARGE"
  | "REVIEW_CONTEXT_UNAVAILABLE";

class S2010ReviewContextError extends Error {
  constructor(readonly code: S2010ReviewContextErrorCode) {
    super("Review context unavailable.");
    this.name = "ReviewContextError";
  }
}

interface S2010ReviewEvidence {
  readonly id: string;
  readonly analysisTargetId: string;
  readonly text: string;
  readonly rating: number;
  readonly reviewDate: string | null;
}

/** Same shape as S2-010's ReviewDatasetContext, including the fields S2-013 must ignore. */
interface S2010ReviewDatasetContext {
  readonly target: {
    readonly id: string;
    readonly name: string;
    readonly platform: "google_maps";
    readonly sourceUrl: string;
  };
  readonly reviews: readonly S2010ReviewEvidence[];
  readonly reviewCount: number;
  readonly strategy: "all-persisted-reviews";
  readonly evidenceJson: string;
  readonly evidenceBytes: number;
}

const TARGET_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const OTHER_TARGET_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const SOURCE_URL_MARKER = "https://www.google.com/maps/place/SOURCE_URL_MARKER";

function review(index: number, text: string, targetId = TARGET_ID): S2010ReviewEvidence {
  return {
    id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    analysisTargetId: targetId,
    rating: 4,
    text,
    reviewDate: "2026-09-01T18:00:00.000Z",
  };
}

/** Builds a context the way S2-010 does, including its evidenceJson/evidenceBytes fields. */
function makeContext(reviews: S2010ReviewEvidence[]): S2010ReviewDatasetContext {
  const target = {
    id: TARGET_ID,
    name: "Restaurant A",
    platform: "google_maps" as const,
    sourceUrl: SOURCE_URL_MARKER,
  };
  const evidenceJson = JSON.stringify({ target, reviews });
  return {
    target,
    reviews,
    reviewCount: reviews.length,
    strategy: "all-persisted-reviews",
    evidenceJson,
    evidenceBytes: Buffer.byteLength(evidenceJson, "utf8"),
  };
}

const defaultContext = makeContext([
  review(1, "Crisp pizza crust and friendly staff."),
  review(2, "Delivery was late and the fries were cold."),
]);

function setup(result: S2010ReviewDatasetContext | Error) {
  // Typed as S2-010's builder signature, which proves its context satisfies QaReviewContext.
  const buildReviewDatasetContext = jest.fn<Promise<S2010ReviewDatasetContext>, [unknown]>(
    async () => {
      if (result instanceof Error) throw result;
      return result;
    },
  );
  const builder: QaReviewContextBuilder = buildReviewDatasetContext;
  const invokeModel = jest.fn(async (request: QaModelRequest) => ({ sent: request }));
  return { buildReviewDatasetContext, deps: { buildReviewDatasetContext: builder, invokeModel } };
}

async function captureRejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("Expected the request to be rejected.");
}

describe("toPromptContext", () => {
  it("keeps only the fields the prompt builder accepts", () => {
    const { target, reviews } = toPromptContext(defaultContext);

    expect(target).toEqual({ id: TARGET_ID, name: "Restaurant A", platform: "google_maps" });
    expect(reviews).toEqual(
      defaultContext.reviews.map(({ id, analysisTargetId, rating, text, reviewDate }) => ({
        id,
        analysisTargetId,
        rating,
        text,
        reviewDate,
      })),
    );
  });
});

describe("runGroundedQaRequest", () => {
  it("builds the context for the target, then the request, then calls the model once", async () => {
    const { buildReviewDatasetContext, deps } = setup(defaultContext);

    await runGroundedQaRequest(TARGET_ID, "What do customers like?", deps);

    expect(buildReviewDatasetContext).toHaveBeenCalledWith(TARGET_ID);
    expect(deps.invokeModel).toHaveBeenCalledTimes(1);
    const request = deps.invokeModel.mock.calls[0][0];
    expect(request.targetId).toBe(TARGET_ID);
    expect(request.instructions).toBe(buildSystemPrompt(toPromptContext(defaultContext).target));
    expect(request.reviewIds).toEqual(defaultContext.reviews.map((r) => r.id));
    expect(request.maxOutputTokens).toBe(QA_RESERVED_OUTPUT_TOKENS);
  });

  it("does not forward the target source URL or S2-010's evidenceJson to the model", async () => {
    const { deps } = setup(defaultContext);

    await runGroundedQaRequest(TARGET_ID, "Any complaints?", deps);

    const request = deps.invokeModel.mock.calls[0][0];
    const sent = request.instructions + request.input;
    expect(sent).not.toContain("SOURCE_URL_MARKER");
    expect(sent).not.toContain(defaultContext.evidenceJson);
    expect(sent).not.toContain("analysisTargetId");
  });

  describe("stops before any model call when a builder throws", () => {
    const contextErrors: S2010ReviewContextErrorCode[] = [
      "AUTH_REQUIRED",
      "AUTH_UNAVAILABLE",
      "NO_REVIEW_DATA",
      "REVIEW_CONTEXT_TOO_LARGE",
      "REVIEW_CONTEXT_UNAVAILABLE",
    ];

    it.each(contextErrors)("S2-010 ReviewContextError %s", async (code) => {
      const thrown = new S2010ReviewContextError(code);
      const { deps } = setup(thrown);

      const error = await captureRejection(
        runGroundedQaRequest(TARGET_ID, "What do customers like?", deps),
      );

      expect(error).toBe(thrown);
      expect(deps.invokeModel).not.toHaveBeenCalled();
    });

    it("S2-010 TargetNotFoundError (missing or foreign target)", async () => {
      const { deps } = setup(new TargetNotFoundError());

      const error = await captureRejection(
        runGroundedQaRequest(OTHER_TARGET_ID, "What do customers like?", deps),
      );

      expect(error).toBeInstanceOf(TargetNotFoundError);
      expect(deps.invokeModel).not.toHaveBeenCalled();
    });

    it("S2-013 EMPTY_QUESTION", async () => {
      const { deps } = setup(defaultContext);

      const error = await captureRejection(runGroundedQaRequest(TARGET_ID, "   ", deps));

      expect(error).toBeInstanceOf(QaPromptError);
      expect(error).toMatchObject({ code: "EMPTY_QUESTION" });
      expect(deps.invokeModel).not.toHaveBeenCalled();
    });

    it("S2-013 NO_REVIEW_DATA if a context ever arrives empty", async () => {
      const { deps } = setup(makeContext([]));

      const error = await captureRejection(
        runGroundedQaRequest(TARGET_ID, "What do customers like?", deps),
      );

      expect(error).toMatchObject({ name: "QaPromptError", code: "NO_REVIEW_DATA" });
      expect(deps.invokeModel).not.toHaveBeenCalled();
    });

    it("S2-013 REVIEW_TARGET_MISMATCH for a review from another target", async () => {
      const { deps } = setup(
        makeContext([review(1, "ok"), review(2, "TARGET_B_MARKER", OTHER_TARGET_ID)]),
      );

      const error = await captureRejection(
        runGroundedQaRequest(TARGET_ID, "What do customers like?", deps),
      );

      expect(error).toMatchObject({ name: "QaPromptError", code: "REVIEW_TARGET_MISMATCH" });
      expect((error as Error).message).not.toContain("TARGET_B_MARKER");
      expect(deps.invokeModel).not.toHaveBeenCalled();
    });
  });

  it("passes S2-010's largest allowed evidence plus a 2,000-character question through the size ceiling", async () => {
    // Grow review text until the S2-010 evidence measurement is as close to its cap as possible.
    const contextWithTextLength = (length: number) =>
      makeContext(
        Array.from({ length: S2010_MAX_CONTEXT_REVIEWS }, (_, i) =>
          review(i, "The service was friendly. ".repeat(50).slice(0, length)),
        ),
      );
    let textLength = 1;
    while (
      contextWithTextLength(textLength + 1).evidenceBytes <= S2010_MAX_CONTEXT_EVIDENCE_BYTES
    ) {
      textLength += 1;
    }
    const maxContext = contextWithTextLength(textLength);
    expect(maxContext.evidenceBytes).toBeLessThanOrEqual(S2010_MAX_CONTEXT_EVIDENCE_BYTES);
    expect(maxContext.evidenceBytes).toBeGreaterThan(S2010_MAX_CONTEXT_EVIDENCE_BYTES - 200);
    const { deps } = setup(maxContext);

    await runGroundedQaRequest(TARGET_ID, "q".repeat(2_000), deps);

    // The pre-network size ceiling must never block S2-010's largest allowed dataset; the exact
    // token count then comes from OpenAI's input_tokens endpoint (tested in the adapter suite).
    const request = deps.invokeModel.mock.calls[0][0];
    expect(() =>
      assertCountableSize(buildInputTokenCountBody(buildOpenAiRequestBody(request, "gpt-6-luna"))),
    ).not.toThrow();
  });
});
