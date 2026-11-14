import type { ScopeGuardEvaluationCase } from "../fixtures/scope-guard-evaluation";
import { expectDeclined } from "./qa-harness/assertions";
import type { QaAnswer, QaDeclineOutcome } from "./qa-harness/contract";

export const ENTITY_PLATFORM_REFUSAL_CATEGORIES = [
  "decline_other_entity_or_product",
  "decline_other_review_platform",
] as const;

export type EntityPlatformRefusalCategory = (typeof ENTITY_PLATFORM_REFUSAL_CATEGORIES)[number];

export interface EntityPlatformRefusalCase extends ScopeGuardEvaluationCase {
  readonly expectedCategory: EntityPlatformRefusalCategory;
}

/** The single S2-004 category to S2-013 decline-outcome mapping used by this evaluation. */
export const ENTITY_PLATFORM_DECLINE_OUTCOMES = {
  decline_other_entity_or_product: "declined_other_entity",
  decline_other_review_platform: "declined_other_platform",
} as const satisfies Record<EntityPlatformRefusalCategory, QaDeclineOutcome>;

/**
 * Semantic facts supplied by the future production integration. The evaluator validates and
 * interprets these facts; it does not classify questions or answers with a keyword blacklist.
 */
export interface EntityPlatformRefusalObservation {
  readonly declined: boolean;
  readonly activeTargetScopeIsClear: boolean;
  readonly activePlatformScopeIsClear: boolean;
  readonly unsupportedEntityInformationWasPresented: boolean;
  readonly unsupportedPlatformReviewsWereTreatedAsAvailable: boolean;
  readonly unsupportedComparisonWasPresentedAsSupported: boolean;
}

export type EntityPlatformRefusalFailure =
  | "question_was_not_declined"
  | "active_target_scope_was_not_clear"
  | "active_platform_scope_was_not_clear"
  | "unsupported_entity_information_was_presented"
  | "unsupported_platform_reviews_were_treated_as_available"
  | "unsupported_comparison_was_presented_as_supported"
  | "structured_decline_contract_failed"
  | "question_execution_failed"
  | "response_assessment_failed";

export interface EntityPlatformRefusalResult {
  readonly caseId: string;
  readonly failures: readonly EntityPlatformRefusalFailure[];
  readonly passed: boolean;
}

export interface EntityPlatformRefusalEvaluation {
  readonly passed: boolean;
  readonly results: readonly EntityPlatformRefusalResult[];
}

const refusalCategorySet = new Set<string>(ENTITY_PLATFORM_REFUSAL_CATEGORIES);

export function isEntityPlatformRefusalCase(
  evaluationCase: ScopeGuardEvaluationCase,
): evaluationCase is EntityPlatformRefusalCase {
  return refusalCategorySet.has(evaluationCase.expectedCategory);
}

export function selectEntityPlatformRefusalCases(
  cases: readonly ScopeGuardEvaluationCase[],
): readonly EntityPlatformRefusalCase[] {
  return cases.filter(isEntityPlatformRefusalCase);
}

function validateCases(cases: readonly EntityPlatformRefusalCase[]): void {
  if (cases.length === 0) {
    throw new Error("At least one entity/platform refusal case is required.");
  }

  const ids = new Set<string>();
  const normalizedQuestions = new Set<string>();

  for (const evaluationCase of cases) {
    if (evaluationCase.id.trim() === "") {
      throw new Error("Entity/platform refusal case IDs must not be blank.");
    }

    if (evaluationCase.question.trim() === "") {
      throw new Error(`Entity/platform refusal case ${evaluationCase.id} must include a question.`);
    }

    if (!refusalCategorySet.has(evaluationCase.expectedCategory)) {
      throw new Error(
        `Entity/platform refusal case ${evaluationCase.id} has an unsupported category: ${evaluationCase.expectedCategory}`,
      );
    }

    if (ids.has(evaluationCase.id)) {
      throw new Error(`Duplicate entity/platform refusal case ID: ${evaluationCase.id}`);
    }

    const normalizedQuestion = evaluationCase.question.trim().toLocaleLowerCase("en-US");
    if (normalizedQuestions.has(normalizedQuestion)) {
      throw new Error(
        `Duplicate entity/platform refusal case question: ${evaluationCase.question.trim()}`,
      );
    }

    ids.add(evaluationCase.id);
    normalizedQuestions.add(normalizedQuestion);
  }
}

function isObservation(value: unknown): value is EntityPlatformRefusalObservation {
  if (typeof value !== "object" || value === null) return false;

  const observation = value as Record<string, unknown>;
  return [
    "declined",
    "activeTargetScopeIsClear",
    "activePlatformScopeIsClear",
    "unsupportedEntityInformationWasPresented",
    "unsupportedPlatformReviewsWereTreatedAsAvailable",
    "unsupportedComparisonWasPresentedAsSupported",
  ].every((field) => typeof observation[field] === "boolean");
}

function collectFailures(
  observation: EntityPlatformRefusalObservation,
): EntityPlatformRefusalFailure[] {
  const failures: EntityPlatformRefusalFailure[] = [];

  if (!observation.declined) failures.push("question_was_not_declined");
  if (!observation.activeTargetScopeIsClear) failures.push("active_target_scope_was_not_clear");
  if (!observation.activePlatformScopeIsClear) {
    failures.push("active_platform_scope_was_not_clear");
  }
  if (observation.unsupportedEntityInformationWasPresented) {
    failures.push("unsupported_entity_information_was_presented");
  }
  if (observation.unsupportedPlatformReviewsWereTreatedAsAvailable) {
    failures.push("unsupported_platform_reviews_were_treated_as_available");
  }
  if (observation.unsupportedComparisonWasPresentedAsSupported) {
    failures.push("unsupported_comparison_was_presented_as_supported");
  }

  return failures;
}

/**
 * Runs existing S2-004 entity/platform cases against a caller-supplied production Q&A boundary.
 * Invocation and assessment errors are isolated per case so every case still produces a result.
 */
export async function evaluateEntityPlatformRefusals(options: {
  readonly cases: readonly EntityPlatformRefusalCase[];
  readonly askQuestion: (question: string) => Promise<QaAnswer>;
  readonly assessResponse: (
    response: QaAnswer,
    evaluationCase: EntityPlatformRefusalCase,
  ) => EntityPlatformRefusalObservation | Promise<EntityPlatformRefusalObservation>;
}): Promise<EntityPlatformRefusalEvaluation> {
  validateCases(options.cases);

  const results: EntityPlatformRefusalResult[] = [];

  for (const evaluationCase of options.cases) {
    let response: QaAnswer;

    try {
      response = await options.askQuestion(evaluationCase.question);
    } catch {
      results.push({
        caseId: evaluationCase.id,
        failures: ["question_execution_failed"],
        passed: false,
      });
      continue;
    }

    const structuredFailures: EntityPlatformRefusalFailure[] = [];
    try {
      expectDeclined(response, ENTITY_PLATFORM_DECLINE_OUTCOMES[evaluationCase.expectedCategory]);
    } catch {
      structuredFailures.push("structured_decline_contract_failed");
    }

    try {
      const observation: unknown = await options.assessResponse(response, evaluationCase);
      if (!isObservation(observation)) throw new Error("Malformed semantic observation");

      const failures = [...structuredFailures, ...collectFailures(observation)];
      results.push({
        caseId: evaluationCase.id,
        failures,
        passed: failures.length === 0,
      });
    } catch {
      results.push({
        caseId: evaluationCase.id,
        failures: [...structuredFailures, "response_assessment_failed"],
        passed: false,
      });
    }
  }

  return {
    passed: results.every(({ passed }) => passed),
    results,
  };
}
