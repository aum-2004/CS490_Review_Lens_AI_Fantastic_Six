import type { QaAnswer } from "@/services/qa/qa-response";
import type { QaOutcome } from "@/services/qa/system-prompt";

import type {
  ScopeGuardEvaluationCase,
  ScopeGuardExpectedCategory,
} from "../fixtures/scope-guard-evaluation";
import { expectDeclined, isDeclineOutcome, QaHarnessAssertionError } from "./qa-harness";

export const GENERAL_KNOWLEDGE_REFUSAL_CATEGORY = "decline_unrelated_general_knowledge" as const;

/** The single translation from S2-004 fixture categories to S2-013 outcomes. */
export const SCOPE_GUARD_CATEGORY_TO_QA_OUTCOME = {
  answer_from_active_reviews: "answered",
  insufficient_review_evidence: "insufficient_evidence",
  decline_unrelated_general_knowledge: "declined_general_knowledge",
  decline_other_entity_or_product: "declined_other_entity",
  decline_other_review_platform: "declined_other_platform",
} as const satisfies Record<ScopeGuardExpectedCategory, QaOutcome>;

export function qaOutcomeForScopeGuardCategory(category: ScopeGuardExpectedCategory): QaOutcome {
  if (!Object.hasOwn(SCOPE_GUARD_CATEGORY_TO_QA_OUTCOME, category)) {
    throw new RangeError(`Unknown scope-guard category: ${String(category)}`);
  }

  return SCOPE_GUARD_CATEGORY_TO_QA_OUTCOME[category];
}

export const GENERAL_KNOWLEDGE_REFUSAL_OUTCOME =
  SCOPE_GUARD_CATEGORY_TO_QA_OUTCOME[GENERAL_KNOWLEDGE_REFUSAL_CATEGORY];

export type GeneralKnowledgeRefusalCase = ScopeGuardEvaluationCase & {
  readonly expectedCategory: typeof GENERAL_KNOWLEDGE_REFUSAL_CATEGORY;
};

/**
 * A semantic observation supplied by the integration layer. This helper deliberately does not
 * infer refusal behavior from keywords in either the question or response.
 */
export interface GeneralKnowledgeRefusalObservation {
  readonly refusalStatus:
    "valid" | "not_declined" | "wrong_decline_outcome" | "invalid_decline_response";
  readonly activeReviewScopeIsClear: boolean;
  readonly scopeAssessmentMethod: "human_review" | "approved_semantic_evaluator";
}

/**
 * Scope clarity is an independent semantic assessment. It must never be derived only from the
 * machine-readable outcome: a bare response such as "No." can have a decline outcome while still
 * failing to explain the active-review boundary.
 */
export interface GeneralKnowledgeScopeAssessment {
  readonly activeReviewScopeIsClear: boolean;
  readonly method: GeneralKnowledgeRefusalObservation["scopeAssessmentMethod"];
}

export type GeneralKnowledgeRefusalFailure =
  | "question_was_not_declined"
  | "wrong_decline_outcome"
  | "invalid_decline_response"
  | "active_review_scope_was_not_clear"
  | "question_execution_failed"
  | "response_assessment_failed";

export interface GeneralKnowledgeRefusalDiagnostic {
  readonly stage: "question_execution" | "response_assessment";
  /** Fixed, non-sensitive diagnostic text; never includes a model response or caught error. */
  readonly message: string;
}

export interface GeneralKnowledgeRefusalResult {
  readonly caseId: string;
  readonly failures: readonly GeneralKnowledgeRefusalFailure[];
  readonly passed: boolean;
  readonly diagnostic?: GeneralKnowledgeRefusalDiagnostic;
}

export interface GeneralKnowledgeRefusalEvaluation {
  readonly passed: boolean;
  readonly results: readonly GeneralKnowledgeRefusalResult[];
}

export function isGeneralKnowledgeRefusalCase(
  evaluationCase: ScopeGuardEvaluationCase,
): evaluationCase is GeneralKnowledgeRefusalCase {
  return evaluationCase.expectedCategory === GENERAL_KNOWLEDGE_REFUSAL_CATEGORY;
}

export function selectGeneralKnowledgeRefusalCases(
  cases: readonly ScopeGuardEvaluationCase[],
): readonly GeneralKnowledgeRefusalCase[] {
  return cases.filter(isGeneralKnowledgeRefusalCase);
}

/** Uses Deep's S2-003 assertion for the machine-readable refusal criterion. */
export function assessGeneralKnowledgeQaAnswer(
  answer: QaAnswer,
  scopeAssessment: GeneralKnowledgeScopeAssessment,
): GeneralKnowledgeRefusalObservation {
  try {
    expectDeclined(answer);
  } catch (error) {
    if (!(error instanceof QaHarnessAssertionError)) {
      throw error;
    }

    return {
      refusalStatus: isDeclineOutcome(answer.outcome) ? "invalid_decline_response" : "not_declined",
      activeReviewScopeIsClear: scopeAssessment.activeReviewScopeIsClear,
      scopeAssessmentMethod: scopeAssessment.method,
    };
  }

  try {
    expectDeclined(answer, GENERAL_KNOWLEDGE_REFUSAL_OUTCOME);
  } catch (error) {
    if (!(error instanceof QaHarnessAssertionError)) {
      throw error;
    }

    return {
      refusalStatus: "wrong_decline_outcome",
      activeReviewScopeIsClear: scopeAssessment.activeReviewScopeIsClear,
      scopeAssessmentMethod: scopeAssessment.method,
    };
  }

  return {
    refusalStatus: "valid",
    activeReviewScopeIsClear: scopeAssessment.activeReviewScopeIsClear,
    scopeAssessmentMethod: scopeAssessment.method,
  };
}

function validateCases(cases: readonly GeneralKnowledgeRefusalCase[]): void {
  if (cases.length === 0) {
    throw new Error("At least one general-knowledge refusal case is required.");
  }

  const ids = new Set<string>();

  for (const evaluationCase of cases) {
    if (evaluationCase.id.trim() === "") {
      throw new Error("General-knowledge refusal case IDs must not be blank.");
    }

    if (evaluationCase.question.trim() === "") {
      throw new Error(
        `General-knowledge refusal case ${evaluationCase.id} must include a question.`,
      );
    }

    if (ids.has(evaluationCase.id)) {
      throw new Error(`Duplicate general-knowledge refusal case ID: ${evaluationCase.id}`);
    }

    ids.add(evaluationCase.id);
  }
}

function isObservation(value: unknown): value is GeneralKnowledgeRefusalObservation {
  if (typeof value !== "object" || value === null) return false;

  const observation = value as Partial<GeneralKnowledgeRefusalObservation>;
  return (
    (observation.refusalStatus === "valid" ||
      observation.refusalStatus === "not_declined" ||
      observation.refusalStatus === "wrong_decline_outcome" ||
      observation.refusalStatus === "invalid_decline_response") &&
    typeof observation.activeReviewScopeIsClear === "boolean" &&
    (observation.scopeAssessmentMethod === "human_review" ||
      observation.scopeAssessmentMethod === "approved_semantic_evaluator")
  );
}

/**
 * Runs S2-004 general-knowledge cases against a caller-supplied Q&A boundary. Invocation and
 * assessment errors become safe per-case failures so one unavailable case does not conceal the
 * remaining results. No caught error text or response content is copied into diagnostics.
 */
export async function evaluateGeneralKnowledgeRefusals<TResponse>(options: {
  readonly cases: readonly GeneralKnowledgeRefusalCase[];
  readonly askQuestion: (question: string) => Promise<TResponse>;
  readonly assessResponse: (
    response: TResponse,
    evaluationCase: GeneralKnowledgeRefusalCase,
  ) => GeneralKnowledgeRefusalObservation | Promise<GeneralKnowledgeRefusalObservation>;
}): Promise<GeneralKnowledgeRefusalEvaluation> {
  validateCases(options.cases);

  const results: GeneralKnowledgeRefusalResult[] = [];

  for (const evaluationCase of options.cases) {
    let response: TResponse;

    try {
      response = await options.askQuestion(evaluationCase.question);
    } catch {
      results.push({
        caseId: evaluationCase.id,
        failures: ["question_execution_failed"],
        passed: false,
        diagnostic: {
          stage: "question_execution",
          message: "The Q&A boundary failed before a response could be assessed.",
        },
      });
      continue;
    }

    let observation: GeneralKnowledgeRefusalObservation;

    try {
      const assessed = await options.assessResponse(response, evaluationCase);
      if (!isObservation(assessed)) {
        throw new TypeError("Malformed general-knowledge refusal observation.");
      }
      observation = assessed;
    } catch {
      results.push({
        caseId: evaluationCase.id,
        failures: ["response_assessment_failed"],
        passed: false,
        diagnostic: {
          stage: "response_assessment",
          message: "The response could not be assessed against the refusal criteria.",
        },
      });
      continue;
    }

    const failures: GeneralKnowledgeRefusalFailure[] = [];

    switch (observation.refusalStatus) {
      case "not_declined":
        failures.push("question_was_not_declined");
        break;
      case "wrong_decline_outcome":
        failures.push("wrong_decline_outcome");
        break;
      case "invalid_decline_response":
        failures.push("invalid_decline_response");
        break;
    }

    if (!observation.activeReviewScopeIsClear) {
      failures.push("active_review_scope_was_not_clear");
    }

    results.push({
      caseId: evaluationCase.id,
      failures,
      passed: failures.length === 0,
    });
  }

  return {
    passed: results.every(({ passed }) => passed),
    results,
  };
}
