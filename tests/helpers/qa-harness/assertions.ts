import type { QaFixtureDataset } from "../../fixtures/qa/datasets";
import {
  isDeclineOutcome,
  REVIEW_PLATFORM_LABELS,
  type QaAnswer,
  type QaDeclineOutcome,
  type QaModelRequest,
  type QaPipelineErrorShape,
} from "./contract";
import { applicationSuppliedInput, extractQuestion } from "./fake-model";

/**
 * S2-003 behaviour-level assertions for the Q&A model boundary. They inspect what was sent to the
 * model and the structure of what came back. They never compare model prose.
 */

export class QaHarnessAssertionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QaHarnessAssertionError";
  }
}

function fail(message: string): never {
  throw new QaHarnessAssertionError(message);
}

/**
 * S2-013: the system prompt is present, names the active target and platform, and keeps
 * untrusted content (review text and the user's question) out of the system instructions.
 */
export function expectSystemPromptApplied(
  request: QaModelRequest,
  dataset: QaFixtureDataset,
  options: { promptVersion?: string } = {},
): void {
  const { target } = dataset;
  if (request.instructions.trim() === "") fail("System instructions are empty.");
  if (request.targetId !== target.id) {
    fail(`Request targetId ${request.targetId} is not the active target ${target.id}.`);
  }
  if (!request.instructions.includes(JSON.stringify(target.name))) {
    fail(`System instructions do not name the active target ${JSON.stringify(target.name)}.`);
  }
  const platform = REVIEW_PLATFORM_LABELS[target.platform];
  if (!request.instructions.includes(platform)) {
    fail(`System instructions do not name the review platform "${platform}".`);
  }
  if (options.promptVersion !== undefined && request.promptVersion !== options.promptVersion) {
    fail(`Prompt version ${request.promptVersion} is not ${options.promptVersion}.`);
  }
  const question = extractQuestion(request.input);
  if (question && question.trim().length > 0 && request.instructions.includes(question.trim())) {
    fail("The user question was placed in the system instructions.");
  }
  for (const review of dataset.reviews) {
    if (review.text.trim() !== "" && request.instructions.includes(review.text)) {
      fail(`Review ${review.id} text was placed in the system instructions.`);
    }
  }
}

/** S2-010: the request carries exactly the active dataset's reviews, in persisted order. */
export function expectContextOnlyForTarget(
  request: QaModelRequest,
  dataset: QaFixtureDataset,
): void {
  if (request.targetId !== dataset.target.id) {
    fail(`Request targetId ${request.targetId} is not ${dataset.target.id} (${dataset.key}).`);
  }
  const expected = dataset.reviews.map((review) => review.id);
  if (JSON.stringify(request.reviewIds) !== JSON.stringify(expected)) {
    fail(
      `Request reviewIds ${JSON.stringify(request.reviewIds)} are not exactly ` +
        `${JSON.stringify(expected)} (${dataset.key}).`,
    );
  }
  const supplied = applicationSuppliedInput(request);
  for (const review of dataset.reviews) {
    if (!supplied.includes(JSON.stringify(review.text))) {
      fail(`Review ${review.id} text from ${dataset.key} is missing from the model input.`);
    }
  }
}

/** S2-013 data minimisation: reviewer names and source URLs never reach the model. */
export function expectNoReviewerIdentity(request: QaModelRequest, dataset: QaFixtureDataset): void {
  const haystack = `${request.instructions}\n${request.input}`;
  for (const review of dataset.reviews) {
    if (review.reviewerName && haystack.includes(review.reviewerName)) {
      fail(`Reviewer name for review ${review.id} was sent to the model.`);
    }
    if (review.reviewUrl && haystack.includes(review.reviewUrl)) {
      fail(`Review URL for review ${review.id} was sent to the model.`);
    }
  }
}

function forbiddenNeedles(dataset: QaFixtureDataset): string[] {
  return [
    dataset.target.id,
    dataset.target.name,
    ...dataset.markers,
    ...dataset.reviews.map((review) => review.id),
    ...dataset.reviews.map((review) => review.text).filter((text) => text.trim().length >= 12),
  ];
}

function findLeaks(haystack: string, foreign: readonly QaFixtureDataset[]): string[] {
  const leaks: string[] = [];
  for (const dataset of foreign) {
    for (const needle of forbiddenNeedles(dataset)) {
      if (haystack.includes(needle) || haystack.includes(JSON.stringify(needle).slice(1, -1))) {
        leaks.push(`${dataset.key}: ${JSON.stringify(needle)}`);
      }
    }
  }
  return leaks;
}

/**
 * S2-016 / S2-018 / S2-019: nothing from another target or another user (markers, review IDs,
 * review text, target ID or name) appears anywhere the application controls in the request.
 * The user's own question is excluded: a user may type a foreign ID, and that alone is not a leak.
 */
export function expectNoForeignData(
  request: QaModelRequest,
  foreign: readonly QaFixtureDataset[],
): void {
  const haystack = [
    request.targetId,
    request.promptVersion,
    request.instructions,
    applicationSuppliedInput(request),
    ...request.reviewIds,
  ].join("\n");
  const leaks = findLeaks(haystack, foreign);
  if (leaks.length > 0) fail(`Foreign data reached the model request:\n- ${leaks.join("\n- ")}`);
}

/** Output-side check: even an echoing model cannot surface foreign data in the answer. */
export function expectAnswerHasNoForeignData(
  answer: QaAnswer,
  foreign: readonly QaFixtureDataset[],
): void {
  const leaks = findLeaks(`${answer.answer}\n${answer.citedReviewIds.join("\n")}`, foreign);
  if (leaks.length > 0) fail(`Foreign data appeared in the answer:\n- ${leaks.join("\n- ")}`);
}

/** S2-011: an answer cites at least one review, and only reviews that were in the request. */
export function expectGroundedAnswer(answer: QaAnswer, request: QaModelRequest): void {
  if (answer.outcome !== "answered") fail(`Expected outcome "answered", got "${answer.outcome}".`);
  expectCitationsWithinRequest(answer, request);
  if (answer.citedReviewIds.length === 0) fail("An answered reply cites no reviews.");
}

/** S2-012: the limitation is reported; any citations still come from the request. */
export function expectInsufficientEvidence(answer: QaAnswer, request: QaModelRequest): void {
  if (answer.outcome !== "insufficient_evidence") {
    fail(`Expected outcome "insufficient_evidence", got "${answer.outcome}".`);
  }
  expectCitationsWithinRequest(answer, request);
}

/** S2-014 / S2-015: a decline, with no supporting evidence attached. */
export function expectDeclined(answer: QaAnswer, outcome?: QaDeclineOutcome): void {
  if (!isDeclineOutcome(answer.outcome)) fail(`Expected a decline, got "${answer.outcome}".`);
  if (outcome !== undefined && answer.outcome !== outcome) {
    fail(`Expected decline "${outcome}", got "${answer.outcome}".`);
  }
  if (answer.citedReviewIds.length > 0) fail("A declined reply carries cited reviews.");
}

export function expectCitationsWithinRequest(answer: QaAnswer, request: QaModelRequest): void {
  if (answer.targetId !== request.targetId) {
    fail(`Answer targetId ${answer.targetId} is not the request targetId ${request.targetId}.`);
  }
  const allowed = new Set(request.reviewIds);
  const outside = answer.citedReviewIds.filter((id) => !allowed.has(id));
  if (outside.length > 0) fail(`Answer cites reviews not in the request: ${outside.join(", ")}.`);
}

/** Matches an error by `name` and `code` only; messages are user-facing copy and may change. */
export function errorMatches(error: unknown, shape: QaPipelineErrorShape): boolean {
  return (
    error instanceof Error &&
    error.name === shape.name &&
    "code" in error &&
    (error as { code: unknown }).code === shape.code
  );
}

export function expectErrorShape(error: unknown, shape: QaPipelineErrorShape): void {
  if (!errorMatches(error, shape)) {
    const actual =
      error instanceof Error
        ? `${error.name}/${String((error as { code?: unknown }).code)}`
        : String(error);
    fail(`Expected ${shape.name}/${shape.code}, got ${actual}.`);
  }
}
