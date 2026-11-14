/**
 * S2-003 harness-owned copy of the Q&A model-boundary contract.
 *
 * ┌──────────────────────────────────────────────────────────────────────────────────────────┐
 * │ PENDING TEAM AGREEMENT. Nothing here is production code and nothing here is authoritative. │
 * └──────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * The real definitions live in unmerged PRs and are NOT imported, so this harness can merge to
 * `main` independently:
 *
 * - `QaModelRequest`, `QA_OUTCOMES`, `QA_DECLINE_PRIORITY`, input format, budget constants:
 *   Aryan, S2-013 (`src/services/qa/system-prompt.ts`, PR #76, as carried by #79).
 * - `QaModelReply`, `QaModelCaller`, `QaAnswer`, reply validation rules, and the entry point
 *   `answerQuestion(targetId, question, { buildReviewDatasetContext, callModel })`: Aryan, S2-011
 *   (`src/services/qa/answer-question.ts`, `qa-response.ts`, PR #79).
 * - `buildReviewDatasetContext(targetId)` and its errors: Shawn, S2-010
 *   (`src/services/qa/review-context.ts`, PR #78).
 *
 * Every item below mirrors PR #79 head `e55c48a` and PR #78 head `6835c29` (2026-11-13). PR #82
 * was closed and consolidated into #78; nothing here depends on it. When #78 and #79 merge, the
 * S2-003 follow-up PR adds compile-time checks that these copies are assignable to and from the
 * real types, then replaces each copy with a re-export. Do not extend this file with new
 * production behaviour; propose changes to the owning story instead.
 *
 * Integration plan (PR 2): call the real `answerQuestion` with the REAL
 * `buildReviewDatasetContext`, so its authentication and ownership checks stay under test. Mock
 * only the infrastructure beneath it: a fake Supabase client (persisted rows), a fake verified
 * auth session for the actor, and the fake model as `callModel`. Never pass a fake builder.
 */

/** Mirror of S2-013 `QA_OUTCOMES`. */
export const QA_OUTCOMES = [
  "answered",
  "insufficient_evidence",
  "declined_general_knowledge",
  "declined_other_entity",
  "declined_other_platform",
] as const;

export type QaOutcome = (typeof QA_OUTCOMES)[number];

/** Mirror of S2-013 `QA_DECLINE_PRIORITY` (the decline outcomes). */
export const QA_DECLINE_OUTCOMES = [
  "declined_other_entity",
  "declined_other_platform",
  "declined_general_knowledge",
] as const satisfies readonly QaOutcome[];

export type QaDeclineOutcome = (typeof QA_DECLINE_OUTCOMES)[number];

export function isDeclineOutcome(outcome: QaOutcome): outcome is QaDeclineOutcome {
  return (QA_DECLINE_OUTCOMES as readonly QaOutcome[]).includes(outcome);
}

/** Mirror of S2-013 `QaModelRequest`: the provider-neutral request handed to the model seam. */
export interface QaModelRequest {
  promptVersion: string;
  targetId: string;
  /** System-level instructions (the ReviewLens system prompt). */
  instructions: string;
  /** User-turn content: the review dataset followed by the question. */
  input: string;
  /** IDs of the reviews included in `input`. */
  reviewIds: string[];
  maxOutputTokens: number;
}

/** Mirror of S2-011 `QaModelReply`: the raw provider reply, before validation. */
export interface QaModelReply {
  text: string;
  usage?: { inputTokens: number; outputTokens: number };
  /** Input tokens counted by S2-011's pre-call budget check (`token-budget.ts`). */
  countedInputTokens?: number;
}

/** Mirror of S2-011 `QaModelCaller`: the single model seam the harness replaces. */
export type QaModelCaller = (request: QaModelRequest) => Promise<QaModelReply>;

/** The JSON object the S2-013 prompt asks the model to return (mirror of `QA_REPLY_JSON_SCHEMA`). */
export interface QaModelReplyPayload {
  outcome: QaOutcome;
  answer: string;
  citedReviewIds: string[];
}

/** Mirror of S2-011 `QaAnswer`: the validated answer returned to callers. */
export interface QaAnswer {
  outcome: QaOutcome;
  answer: string;
  citedReviewIds: string[];
  promptVersion: string;
  targetId: string;
}

/**
 * Mirror of the S2-013 user-turn layout. The harness reads the question back out of `input` so
 * scripts can match on it. PENDING AGREEMENT: ask S2-013 to export a parser or add a `question`
 * field to `QaModelRequest`, so the harness does not depend on prompt formatting.
 */
export const QA_INPUT_QUESTION_HEADER = "QUESTION (JSON string):";

/**
 * Mirror of the S2-013 evidence section that opens `input`:
 *
 *   REVIEW DATASET (<n> reviews, JSON array):
 *   [{"id":…,"rating":…,"date":…,"text":…}, …]
 *
 * Each row is exactly this projection of a persisted Review, in persisted order. Reviewer names,
 * URLs and source metadata are deliberately absent (S2-013 data minimisation).
 */
export const QA_INPUT_DATASET_HEADER_PATTERN = /^REVIEW DATASET \((\d+) reviews, JSON array\):$/;

export interface QaEvidenceRow {
  id: string;
  rating: number;
  /** The review's `reviewDate` (ISO 8601) or null. */
  date: string | null;
  text: string;
}

export const QA_EVIDENCE_ROW_FIELDS = [
  "id",
  "rating",
  "date",
  "text",
] as const satisfies readonly (keyof QaEvidenceRow)[];

/**
 * S2-013 system-prompt contract as stable semantic invariants, not exact prose.
 *
 * PENDING AGREEMENT (Aryan, S2-013). Each invariant lists alternatives. An alternative is satisfied
 * when ONE sentence of the whitespace-normalised prompt matches ALL of its patterns, so a rule must
 * be stated together, not assembled from words scattered across the prompt. Rewording the prompt is
 * fine as long as each rule is still stated. Until the S2-003 integration PR runs these against the
 * real S2-013 prompt, CI checks them only against the reference pipeline's placeholder prompt.
 *
 * The target name (JSON-encoded) and platform label are checked separately, per target.
 */
export interface QaPromptInvariant {
  readonly id: string;
  readonly rule: string;
  readonly alternatives: readonly (readonly RegExp[])[];
}

export const QA_SYSTEM_PROMPT_INVARIANTS = [
  {
    id: "grounded-in-reviews",
    rule: "Answers are based only on the supplied reviews.",
    alternatives: [
      [/\bonly\b/i, /\b(supplied|provided)\b/i, /\breviews?\b/i, /\b(answer|base|evidence)/i],
    ],
  },
  {
    id: "no-outside-knowledge",
    rule: "Outside or general knowledge must not be used.",
    alternatives: [
      [/\b(do not|don't|never|must not)\b/i, /\b(outside|general|external)\b/i, /\bknowledge\b/i],
    ],
  },
  {
    id: "insufficient-evidence",
    rule: "When the reviews lack enough information, say so instead of guessing.",
    alternatives: [[/\b(not|lack\w*|without)\b/i, /\benough\b/i, /\b(information|evidence)\b/i]],
  },
  {
    id: "decline-out-of-scope",
    rule: "Questions not about analysing these reviews are declined.",
    alternatives: [[/\bdecline\b/i, /\bquestions?\b/i, /\b(not about|unrelated|general)\b/i]],
  },
  {
    id: "decline-other-entity",
    rule: "Questions about another entity, business or product are declined.",
    alternatives: [
      [/\bdecline\b/i, /\b(other|another|different)\b/i, /\b(entity|entities|business|product)\b/i],
    ],
  },
  {
    id: "decline-other-platform",
    rule: "Questions about reviews from another platform are declined.",
    alternatives: [[/\bdecline\b/i, /\b(other|another|different)\b/i, /\bplatforms?\b/i]],
  },
] as const satisfies readonly QaPromptInvariant[];

export type QaPromptInvariantId = (typeof QA_SYSTEM_PROMPT_INVARIANTS)[number]["id"];

/**
 * Mirror of S2-013 request-budget constants (application budget, not a model limit).
 *
 * In #79 the budget is enforced inside the OpenAI adapter (`createOpenAiQaModel` →
 * `token-budget.ts`), i.e. BELOW the `callModel` seam. With a fake `callModel`, the real pipeline
 * therefore does not reject an oversized question before the model call. See the open question in
 * `reference-pipeline.ts` and the `qa-edge-long-question` golden case.
 */
export const QA_MAX_REQUEST_TOKENS = 16_000;
export const QA_RESERVED_OUTPUT_TOKENS = 1_500;

/** Mirror of S2-013 `REVIEW_PLATFORM_LABELS`. */
export const REVIEW_PLATFORM_LABELS = { google_maps: "Google Maps" } as const;

/**
 * Error names and codes the pipeline throws (S2-010, S2-011, S2-013, S1-013). Golden cases assert
 * on `name` and `code`, never on message text, so they hold for both the reference pipeline and
 * the real one.
 */
export const QA_PIPELINE_ERRORS = {
  targetNotFound: { name: "TargetNotFoundError", code: "TARGET_NOT_FOUND" },
  noReviewData: { name: "ReviewContextError", code: "NO_REVIEW_DATA" },
  contextUnavailable: { name: "ReviewContextError", code: "REVIEW_CONTEXT_UNAVAILABLE" },
  emptyQuestion: { name: "QaPromptError", code: "EMPTY_QUESTION" },
  requestTooLarge: { name: "QaPromptError", code: "REQUEST_TOO_LARGE" },
  invalidModelResponse: { name: "QaResponseError", code: "INVALID_MODEL_RESPONSE" },
  ungroundedAnswer: { name: "QaResponseError", code: "UNGROUNDED_ANSWER" },
  /** #79: any outcome other than "answered" that carries citations is rejected, not repaired. */
  unexpectedCitations: { name: "QaResponseError", code: "UNEXPECTED_CITATIONS" },
  modelTimeout: { name: "QaModelError", code: "MODEL_TIMEOUT" },
  modelUnavailable: { name: "QaModelError", code: "MODEL_UNAVAILABLE" },
  modelRateLimited: { name: "QaModelError", code: "MODEL_RATE_LIMITED" },
} as const satisfies Record<string, { name: string; code: string }>;

export type QaPipelineErrorKey = keyof typeof QA_PIPELINE_ERRORS;
export type QaPipelineErrorShape = (typeof QA_PIPELINE_ERRORS)[QaPipelineErrorKey];

/** A test identity. In the real pipeline this becomes the mocked verified Supabase session. */
export interface QaActor {
  readonly id: string;
  readonly email: string;
}

/**
 * Harness-defined orchestration entry point. The harness calls whatever implements this: the
 * contract reference pipeline in PR 1, and in PR 2 an adapter that installs a fake verified auth
 * session for `actor` and a fake Supabase client holding the fixture rows, then calls
 * `answerQuestion(targetId, question, { buildReviewDatasetContext, callModel })` with the REAL
 * S2-010 `buildReviewDatasetContext`, so authentication and ownership remain under test. Only the
 * infrastructure under the builder and the model are faked; the builder itself never is.
 */
export interface QaPipelineInput {
  readonly actor: QaActor;
  readonly targetId: unknown;
  readonly question: string;
  readonly callModel: QaModelCaller;
}

export type QaPipeline = (input: QaPipelineInput) => Promise<QaAnswer>;
