export const GENERAL_KNOWLEDGE_REFUSAL_CATEGORY = "decline_unrelated_general_knowledge" as const;

export interface ScopeGuardEvaluationCaseLike {
  readonly id: string;
  readonly question: string;
  readonly expectedCategory: string;
}

export interface GeneralKnowledgeRefusalCase extends ScopeGuardEvaluationCaseLike {
  readonly expectedCategory: typeof GENERAL_KNOWLEDGE_REFUSAL_CATEGORY;
}

/**
 * A semantic observation supplied by the integration layer. This helper deliberately does not
 * infer refusal behavior from keywords in either the question or response.
 */
export interface GeneralKnowledgeRefusalObservation {
  readonly declined: boolean;
  readonly activeReviewScopeIsClear: boolean;
}

export type GeneralKnowledgeRefusalFailure =
  | "question_was_not_declined"
  | "active_review_scope_was_not_clear"
  | "question_execution_failed"
  | "response_assessment_failed";

export interface GeneralKnowledgeRefusalResult {
  readonly caseId: string;
  readonly failures: readonly GeneralKnowledgeRefusalFailure[];
  readonly passed: boolean;
}

export interface GeneralKnowledgeRefusalEvaluation {
  readonly passed: boolean;
  readonly results: readonly GeneralKnowledgeRefusalResult[];
}

export function isGeneralKnowledgeRefusalCase(
  evaluationCase: ScopeGuardEvaluationCaseLike,
): evaluationCase is GeneralKnowledgeRefusalCase {
  return evaluationCase.expectedCategory === GENERAL_KNOWLEDGE_REFUSAL_CATEGORY;
}

export function selectGeneralKnowledgeRefusalCases(
  cases: readonly ScopeGuardEvaluationCaseLike[],
): readonly GeneralKnowledgeRefusalCase[] {
  return cases.filter(isGeneralKnowledgeRefusalCase);
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

/**
 * Runs existing S2-004 general-knowledge cases against a caller-supplied Q&A boundary.
 *
 * The caller owns both production invocation and semantic response assessment because this branch
 * does not yet contain either contract. Invocation and assessment errors become per-case failures
 * so one unavailable case does not conceal the remaining results.
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
      });
      continue;
    }

    let observation: GeneralKnowledgeRefusalObservation;

    try {
      observation = await options.assessResponse(response, evaluationCase);
    } catch {
      results.push({
        caseId: evaluationCase.id,
        failures: ["response_assessment_failed"],
        passed: false,
      });
      continue;
    }

    const failures: GeneralKnowledgeRefusalFailure[] = [];

    if (!observation.declined) {
      failures.push("question_was_not_declined");
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
