import type { QaFixtureDataset } from "../../fixtures/qa/datasets";
import {
  QA_INPUT_QUESTION_HEADER,
  QA_MAX_REQUEST_TOKENS,
  QA_OUTCOMES,
  QA_PIPELINE_ERRORS,
  QA_RESERVED_OUTPUT_TOKENS,
  REVIEW_PLATFORM_LABELS,
  type QaAnswer,
  type QaModelRequest,
  type QaOutcome,
  type QaPipeline,
  type QaPipelineErrorShape,
} from "./contract";

/**
 * S2-003 CONTRACT REFERENCE PIPELINE. TEST-ONLY STAND-IN, NOT THE REVIEWLENS IMPLEMENTATION.
 *
 * The real Q&A pipeline (S2-010 context builder, S2-013 prompt, S2-011 reply validation) is not on
 * `main` yet. This stand-in follows the contract of PR #79 (`answerQuestion`, `parseQaModelReply`)
 * and PR #78 (`buildReviewDatasetContext`), so the harness, golden cases and assertions can run in
 * CI today: same order of checks, same error names and codes, same request layout. Its system
 * prompt is a placeholder and is NOT the S2-013 prompt.
 *
 * The S2-003 follow-up PR replaces this with an adapter that calls the real
 * `answerQuestion(targetId, question, { buildReviewDatasetContext, callModel })` using the REAL
 * S2-010 builder over a fake Supabase client and fake verified session, so authentication and
 * ownership stay under test. The same golden cases must then pass unchanged. Any case that passes
 * here but fails there is a contract mismatch to raise with the owning story, not something to
 * "fix" in this file.
 *
 * KNOWN DIFFERENCE (open question): this stand-in rejects an oversized request with
 * REQUEST_TOO_LARGE before calling the model. In #79 that budget check runs inside the OpenAI
 * adapter, below the `callModel` seam, so with a fake model the real pipeline would call the model
 * instead. The `qa-edge-long-question` golden case needs a team decision before PR 2.
 */

export const REFERENCE_PROMPT_VERSION = "s2-003.reference";
const MAX_ANSWER_CHARACTERS = 8_000;
const MAX_CITED_REVIEW_IDS = 1_000;
/** Placeholder size estimate for the stand-in only; #79 counts real tokens in token-budget.ts. */
const ESTIMATED_BYTES_PER_TOKEN = 3;

class ReferencePipelineError extends Error {
  readonly code: string;

  constructor(shape: QaPipelineErrorShape) {
    super(`Reference pipeline: ${shape.code}`);
    this.name = shape.name;
    this.code = shape.code;
  }
}

const utf8 = new TextEncoder();
const estimateTokens = (text: string): number =>
  Math.ceil(utf8.encode(text).length / ESTIMATED_BYTES_PER_TOKEN);

function referenceInstructions(dataset: QaFixtureDataset): string {
  const name = JSON.stringify(dataset.target.name);
  const platform = REVIEW_PLATFORM_LABELS[dataset.target.platform];
  // States each rule in QA_SYSTEM_PROMPT_INVARIANTS once, in its own sentence, like S2-013 does.
  return [
    "[S2-003 reference placeholder prompt; not the S2-013 system prompt]",
    `You analyze the ${platform} reviews for ${name} supplied in the user message.`,
    "Base every answer only on the supplied reviews.",
    "Do not use outside or general knowledge.",
    "If the reviews do not contain enough information to answer, say so instead of guessing.",
    "Decline questions that are not about analyzing these reviews.",
    `Decline questions about any other entity, business, or product than ${name}.`,
    `Decline questions about reviews from any other platform than ${platform}.`,
    `Reply with JSON: {"outcome": one of ${QA_OUTCOMES.join(", ")}, "answer", "citedReviewIds"}.`,
  ].join("\n");
}

/** S2-010 order: ownership, then empty dataset, then row validation. All fail closed. */
function loadAuthorizedContext(
  datasets: readonly QaFixtureDataset[],
  actorId: string,
  targetId: unknown,
): QaFixtureDataset {
  if (typeof targetId !== "string")
    throw new ReferencePipelineError(QA_PIPELINE_ERRORS.targetNotFound);
  const dataset = datasets.find((candidate) => candidate.target.id === targetId);
  // Missing and foreign targets are indistinguishable (S1-013).
  if (!dataset || dataset.owner.id !== actorId) {
    throw new ReferencePipelineError(QA_PIPELINE_ERRORS.targetNotFound);
  }
  if (dataset.reviews.length === 0) {
    throw new ReferencePipelineError(QA_PIPELINE_ERRORS.noReviewData);
  }
  const seen = new Set<string>();
  for (const review of dataset.reviews) {
    if (
      review.analysisTargetId !== dataset.target.id ||
      review.text.trim() === "" ||
      !Number.isFinite(review.rating) ||
      review.rating < 1 ||
      review.rating > 5 ||
      seen.has(review.id)
    ) {
      throw new ReferencePipelineError(QA_PIPELINE_ERRORS.contextUnavailable);
    }
    seen.add(review.id);
  }
  return dataset;
}

/** S2-013 request layout: review dataset JSON, then the question as a JSON string. */
function buildRequest(dataset: QaFixtureDataset, question: string): QaModelRequest {
  const trimmed = question.trim();
  if (trimmed === "") throw new ReferencePipelineError(QA_PIPELINE_ERRORS.emptyQuestion);

  const rows = dataset.reviews.map((review) => ({
    id: review.id,
    rating: review.rating,
    date: review.reviewDate,
    text: review.text,
  }));
  const input =
    `REVIEW DATASET (${rows.length} reviews, JSON array):\n${JSON.stringify(rows)}\n\n` +
    `${QA_INPUT_QUESTION_HEADER}\n${JSON.stringify(trimmed)}`;
  const instructions = referenceInstructions(dataset);
  const estimatedInputTokens = estimateTokens(instructions) + estimateTokens(input);
  if (estimatedInputTokens + QA_RESERVED_OUTPUT_TOKENS > QA_MAX_REQUEST_TOKENS) {
    throw new ReferencePipelineError(QA_PIPELINE_ERRORS.requestTooLarge);
  }
  return {
    promptVersion: REFERENCE_PROMPT_VERSION,
    targetId: dataset.target.id,
    instructions,
    input,
    reviewIds: rows.map((row) => row.id),
    maxOutputTokens: QA_RESERVED_OUTPUT_TOKENS,
  };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * S2-011 validation (#79 `parseQaModelReply`), in the same order: strict shape, then no invented
 * citations (UNGROUNDED_ANSWER), then "answered" must cite at least one review (UNGROUNDED_ANSWER),
 * and every other outcome must cite none (UNEXPECTED_CITATIONS). Contradictory replies are
 * rejected, never repaired by dropping citations.
 */
function validateReply(text: string, request: QaModelRequest): QaAnswer {
  const invalid = () => new ReferencePipelineError(QA_PIPELINE_ERRORS.invalidModelResponse);
  const ungrounded = () => new ReferencePipelineError(QA_PIPELINE_ERRORS.ungroundedAnswer);
  const unexpectedCitations = () =>
    new ReferencePipelineError(QA_PIPELINE_ERRORS.unexpectedCitations);

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw invalid();
  }
  if (!isRecord(json)) throw invalid();
  const keys = Object.keys(json).sort().join(",");
  if (keys !== "answer,citedReviewIds,outcome") throw invalid();
  const { outcome, answer, citedReviewIds } = json;
  if (typeof outcome !== "string" || !(QA_OUTCOMES as readonly string[]).includes(outcome)) {
    throw invalid();
  }
  if (
    typeof answer !== "string" ||
    answer.trim() === "" ||
    answer.trim().length > MAX_ANSWER_CHARACTERS
  ) {
    throw invalid();
  }
  if (
    !Array.isArray(citedReviewIds) ||
    citedReviewIds.length > MAX_CITED_REVIEW_IDS ||
    !citedReviewIds.every((id): id is string => typeof id === "string")
  ) {
    throw invalid();
  }

  const allowed = new Set(request.reviewIds);
  if (citedReviewIds.some((id) => !allowed.has(id))) throw ungrounded();
  const cited = [...new Set(citedReviewIds)];
  const typedOutcome = outcome as QaOutcome;
  if (typedOutcome === "answered") {
    if (cited.length === 0) throw ungrounded();
  } else if (cited.length > 0) {
    throw unexpectedCitations();
  }

  return {
    outcome: typedOutcome,
    answer: answer.trim(),
    citedReviewIds: cited,
    promptVersion: request.promptVersion,
    targetId: request.targetId,
  };
}

/** Builds a reference pipeline over the given fixture datasets (the stand-in "database"). */
export function createReferencePipeline(datasets: readonly QaFixtureDataset[]): QaPipeline {
  return async ({ actor, targetId, question, callModel }) => {
    const dataset = loadAuthorizedContext(datasets, actor.id, targetId);
    const request = buildRequest(dataset, question);
    const reply = await callModel(request);
    return validateReply(reply.text, request);
  };
}
