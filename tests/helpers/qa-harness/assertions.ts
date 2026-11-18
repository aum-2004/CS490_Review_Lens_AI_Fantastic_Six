import type { QaFixtureDataset } from "../../fixtures/qa/datasets";
import {
  buildSystemPrompt,
  isDeclineOutcome,
  QA_EVIDENCE_ROW_FIELDS,
  QA_INPUT_DATASET_HEADER_PATTERN,
  QA_INPUT_TARGET_METADATA_HEADER,
  QA_SYSTEM_PROMPT_INVARIANTS,
  REVIEW_PLATFORM_LABELS,
  type QaAnswer,
  type QaDeclineOutcome,
  type QaEvidenceRow,
  type QaModelRequest,
  type QaPipelineErrorShape,
  type QaPromptInvariant,
  type QaPromptInvariantId,
  type QaTargetMetadata,
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

/** Whitespace-normalised sentences of a prompt (rules may wrap across lines). */
function promptSentences(instructions: string): string[] {
  return instructions
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) => sentence.trim() !== "");
}

function satisfies(invariant: QaPromptInvariant, sentences: readonly string[]): boolean {
  return invariant.alternatives.some((patterns) =>
    sentences.some((sentence) => patterns.every((pattern) => pattern.test(sentence))),
  );
}

/** IDs of the S2-013 prompt invariants (see `QA_SYSTEM_PROMPT_INVARIANTS`) the prompt lacks. */
export function missingPromptInvariants(instructions: string): QaPromptInvariantId[] {
  const sentences = promptSentences(instructions);
  return QA_SYSTEM_PROMPT_INVARIANTS.filter((invariant) => !satisfies(invariant, sentences)).map(
    (invariant) => invariant.id,
  );
}

/**
 * S2-013: the system prompt is present, states every rule in `QA_SYSTEM_PROMPT_INVARIANTS`
 * (grounding, no outside knowledge, insufficient evidence, and the three decline rules), and
 * keeps untrusted target metadata, review text, and the user's question out of the system
 * instructions. Target identity is checked in the structured user-turn metadata instead. The
 * final equality check ensures no target-specific value has been appended to the canonical rules.
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
  const metadata = parseTargetMetadata(request);
  if (metadata.name !== target.name) {
    fail(
      `Target metadata names ${JSON.stringify(metadata.name)} instead of ` +
        `${JSON.stringify(target.name)}.`,
    );
  }
  const platform = REVIEW_PLATFORM_LABELS[target.platform];
  if (metadata.reviewPlatform !== platform) {
    fail(
      `Target metadata names review platform ${JSON.stringify(metadata.reviewPlatform)} ` +
        `instead of ${JSON.stringify(platform)}.`,
    );
  }
  const missing = missingPromptInvariants(request.instructions);
  if (missing.length > 0) {
    const rules = QA_SYSTEM_PROMPT_INVARIANTS.filter((invariant) =>
      (missing as string[]).includes(invariant.id),
    ).map((invariant) => `${invariant.id} (${invariant.rule})`);
    fail(`System instructions are missing prompt rules:\n- ${rules.join("\n- ")}`);
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
  if (request.instructions !== buildSystemPrompt()) {
    fail("System instructions differ from the target-independent production prompt.");
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Parses and shape-checks the untrusted target metadata at the start of `request.input`. */
export function parseTargetMetadata(request: QaModelRequest): QaTargetMetadata {
  const supplied = applicationSuppliedInput(request).replace(/\n+$/, "");
  const separator = "\n\n";
  const end = supplied.indexOf(separator);
  const section = end === -1 ? supplied : supplied.slice(0, end);
  const newline = section.indexOf("\n");
  const header = newline === -1 ? section : section.slice(0, newline);
  if (header !== QA_INPUT_TARGET_METADATA_HEADER || newline === -1) {
    fail("Model input does not start with a TARGET METADATA section.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(section.slice(newline + 1));
  } catch {
    fail("The TARGET METADATA section is not one valid JSON object.");
  }
  if (!isRecord(parsed)) fail("The TARGET METADATA section is not a JSON object.");
  const keys = Object.keys(parsed).sort().join(",");
  if (keys !== "name,reviewPlatform") {
    fail(`Target metadata has fields [${keys}]; expected [name,reviewPlatform].`);
  }
  const { name, reviewPlatform } = parsed;
  if (typeof name !== "string" || typeof reviewPlatform !== "string") {
    fail("Target metadata has a field of the wrong type.");
  }
  return { name, reviewPlatform };
}

/**
 * Parses the S2-013 evidence section of `request.input` (see `QA_INPUT_DATASET_HEADER_PATTERN`)
 * into rows, failing on any layout or shape problem: missing header, invalid JSON, a declared
 * count that differs from the rows, or a row whose fields are not exactly id/rating/date/text.
 */
export function parseEvidenceRows(request: QaModelRequest): QaEvidenceRow[] {
  const supplied = applicationSuppliedInput(request).replace(/\n+$/, "");
  const lines = supplied.split("\n");
  const headerIndex = lines.findIndex((line) => QA_INPUT_DATASET_HEADER_PATTERN.test(line));
  const header = headerIndex === -1 ? "" : lines[headerIndex];
  const match = QA_INPUT_DATASET_HEADER_PATTERN.exec(header);
  if (!match || headerIndex === lines.length - 1) {
    fail("Model input does not contain a REVIEW DATASET section after target metadata.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(lines.slice(headerIndex + 1).join("\n"));
  } catch {
    fail("The REVIEW DATASET section is not a single valid JSON array.");
  }
  if (!Array.isArray(parsed)) fail("The REVIEW DATASET section is not a JSON array.");
  if (Number(match[1]) !== parsed.length) {
    fail(`The REVIEW DATASET header declares ${match[1]} reviews but contains ${parsed.length}.`);
  }

  const expectedKeys = [...QA_EVIDENCE_ROW_FIELDS].sort().join(",");
  return parsed.map((row: unknown, index): QaEvidenceRow => {
    const label = `Evidence row ${index + 1}`;
    if (!isRecord(row)) fail(`${label} is not an object.`);
    const keys = Object.keys(row).sort().join(",");
    if (keys !== expectedKeys) fail(`${label} has fields [${keys}]; expected [${expectedKeys}].`);
    const { id, rating, date, text } = row;
    if (
      typeof id !== "string" ||
      typeof rating !== "number" ||
      (date !== null && typeof date !== "string") ||
      typeof text !== "string"
    ) {
      fail(`${label} has a field of the wrong type.`);
    }
    return { id, rating, date, text };
  });
}

/**
 * S2-010 / S2-013: the request carries exactly the active dataset's evidence. Every row's id,
 * rating, date and text matches the persisted review at the same position, with nothing dropped,
 * added or reordered, and `reviewIds` lists the same IDs in the same order.
 */
export function expectContextOnlyForTarget(
  request: QaModelRequest,
  dataset: QaFixtureDataset,
): void {
  if (request.targetId !== dataset.target.id) {
    fail(`Request targetId ${request.targetId} is not ${dataset.target.id} (${dataset.key}).`);
  }

  const metadata = parseTargetMetadata(request);
  const expectedMetadata: QaTargetMetadata = {
    name: dataset.target.name,
    reviewPlatform: REVIEW_PLATFORM_LABELS[dataset.target.platform],
  };
  if (JSON.stringify(metadata) !== JSON.stringify(expectedMetadata)) {
    fail(
      `Target metadata ${JSON.stringify(metadata)} is not ${JSON.stringify(expectedMetadata)} ` +
        `(${dataset.key}).`,
    );
  }

  const rows = parseEvidenceRows(request);
  const expected: QaEvidenceRow[] = dataset.reviews.map((review) => ({
    id: review.id,
    rating: review.rating,
    date: review.reviewDate,
    text: review.text,
  }));
  if (rows.length !== expected.length) {
    fail(`Model input has ${rows.length} reviews; ${dataset.key} has ${expected.length}.`);
  }
  const sortedIds = (list: readonly QaEvidenceRow[]) =>
    JSON.stringify(list.map((r) => r.id).sort());
  if (
    sortedIds(rows) === sortedIds(expected) &&
    rows.some((row, index) => row.id !== expected[index].id)
  ) {
    fail(`Evidence rows are not in persisted order for ${dataset.key}.`);
  }
  for (const [index, row] of rows.entries()) {
    for (const field of QA_EVIDENCE_ROW_FIELDS) {
      if (row[field] !== expected[index][field]) {
        fail(
          `Evidence row ${index + 1} ${field} is ${JSON.stringify(row[field])}; expected ` +
            `${JSON.stringify(expected[index][field])} (${dataset.key} review ${expected[index].id}).`,
        );
      }
    }
  }

  const expectedIds = expected.map((row) => row.id);
  if (JSON.stringify(request.reviewIds) !== JSON.stringify(expectedIds)) {
    fail(
      `Request reviewIds ${JSON.stringify(request.reviewIds)} are not exactly ` +
        `${JSON.stringify(expectedIds)} (${dataset.key}).`,
    );
  }
}

function serializedRequest(request: QaModelRequest, excludeQuestion: boolean): string {
  return Object.entries(request)
    .map(([key, value]) =>
      key === "input" && excludeQuestion
        ? applicationSuppliedInput(request)
        : (JSON.stringify(value) ?? String(value)),
    )
    .join("\n");
}

function includesRawOrJsonEscaped(haystack: string, needle: string): boolean {
  const jsonEscaped = JSON.stringify(needle).slice(1, -1);
  return haystack.includes(needle) || haystack.includes(jsonEscaped);
}

/** S2-013 data minimisation: reviewer names and source URLs never reach the model. */
export function expectNoReviewerIdentity(request: QaModelRequest, dataset: QaFixtureDataset): void {
  const haystack = serializedRequest(request, false);
  for (const review of dataset.reviews) {
    if (review.reviewerName && includesRawOrJsonEscaped(haystack, review.reviewerName)) {
      fail(`Reviewer name for review ${review.id} was sent to the model.`);
    }
    if (review.reviewUrl && includesRawOrJsonEscaped(haystack, review.reviewUrl)) {
      fail(`Review URL for review ${review.id} was sent to the model.`);
    }
  }
}

function stringLeaves(value: unknown): string[] {
  if (typeof value === "string") return value.trim() === "" ? [] : [value];
  if (Array.isArray(value)) return value.flatMap(stringLeaves);
  if (isRecord(value)) return Object.values(value).flatMap(stringLeaves);
  return [];
}

function forbiddenNeedles(dataset: QaFixtureDataset): string[] {
  return [
    dataset.target.id,
    dataset.target.name,
    dataset.target.ownerId,
    dataset.target.sourceUrl,
    dataset.target.googlePlaceId,
    dataset.target.createdAt,
    dataset.owner.id,
    dataset.owner.email,
    ...dataset.markers,
    ...dataset.reviews.flatMap((review) => [
      review.id,
      review.analysisTargetId,
      review.text,
      review.sourceReviewId,
      review.reviewerName,
      review.reviewDate,
      review.reviewUrl,
      review.createdAt,
      ...stringLeaves(review.sourceMetadata),
    ]),
  ].filter(
    (needle, index, all): needle is string =>
      typeof needle === "string" && needle.trim() !== "" && all.indexOf(needle) === index,
  );
}

function findLeaks(haystack: string, foreign: readonly QaFixtureDataset[]): string[] {
  const leaks: string[] = [];
  for (const dataset of foreign) {
    for (const needle of forbiddenNeedles(dataset)) {
      if (includesRawOrJsonEscaped(haystack, needle)) {
        leaks.push(`${dataset.key}: ${JSON.stringify(needle)}`);
      }
    }
  }
  return leaks;
}

/**
 * S2-016 / S2-018 / S2-019: no persisted value from another target or user (including review and
 * source IDs, metadata string leaves, reviewer/source fields, review text, markers, and target
 * fields) appears anywhere the application controls in the request. The user's own question is
 * excluded: a user may type a foreign ID, and that alone is not a leak.
 */
export function expectNoForeignData(
  request: QaModelRequest,
  foreign: readonly QaFixtureDataset[],
): void {
  const haystack = serializedRequest(request, true);
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

/**
 * S2-012: the limitation is reported with no citations. Under #79 a reply that cites reviews with
 * this outcome is rejected (UNEXPECTED_CITATIONS), so a validated answer never carries any.
 */
export function expectInsufficientEvidence(answer: QaAnswer, request: QaModelRequest): void {
  if (answer.outcome !== "insufficient_evidence") {
    fail(`Expected outcome "insufficient_evidence", got "${answer.outcome}".`);
  }
  expectCitationsWithinRequest(answer, request);
  if (answer.citedReviewIds.length > 0) {
    fail("An insufficient_evidence answer carries cited reviews; #79 must reject that reply.");
  }
}

/**
 * S2-014 / S2-015: a decline with no citations. Under #79 a decline that cites reviews is rejected
 * (UNEXPECTED_CITATIONS), so a validated decline never carries any; citations here mean the
 * pipeline accepted a contradictory reply instead of rejecting it.
 */
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
