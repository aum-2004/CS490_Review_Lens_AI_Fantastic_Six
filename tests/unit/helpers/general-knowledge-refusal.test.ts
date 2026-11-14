/** @jest-environment node */

import { scopeGuardEvaluationFixture } from "../../fixtures/scope-guard-evaluation";
import {
  GENERAL_KNOWLEDGE_REFUSAL_OUTCOME,
  SCOPE_GUARD_CATEGORY_TO_QA_OUTCOME,
  assessGeneralKnowledgeQaAnswer,
  evaluateGeneralKnowledgeRefusals,
  qaOutcomeForScopeGuardCategory,
  selectGeneralKnowledgeRefusalCases,
  type GeneralKnowledgeRefusalCase,
  type GeneralKnowledgeRefusalObservation,
} from "../../helpers/general-knowledge-refusal";
import type { QaAnswer, QaOutcome } from "../../helpers/qa-harness";

const generalKnowledgeCases = selectGeneralKnowledgeRefusalCases(scopeGuardEvaluationFixture.cases);

function qaAnswer(overrides: Partial<QaAnswer> = {}): QaAnswer {
  return {
    outcome: GENERAL_KNOWLEDGE_REFUSAL_OUTCOME,
    answer: "I can only analyze the active target's reviews.",
    citedReviewIds: [],
    promptVersion: "test",
    targetId: scopeGuardEvaluationFixture.activeTarget.id,
    ...overrides,
  };
}

const clearScope = {
  activeReviewScopeIsClear: true,
  method: "human_review",
} as const;

describe("general-knowledge refusal evaluation helper", () => {
  it("selects all four real S2-004 general-knowledge cases without copying their questions", () => {
    expect(generalKnowledgeCases.map(({ id }) => id)).toEqual([
      "sg-general-001",
      "sg-general-002",
      "sg-general-003",
      "sg-general-004",
    ]);
  });

  it("maps every S2-004 category to exactly one S2-013 outcome", () => {
    expect(SCOPE_GUARD_CATEGORY_TO_QA_OUTCOME).toEqual({
      answer_from_active_reviews: "answered",
      insufficient_review_evidence: "insufficient_evidence",
      decline_unrelated_general_knowledge: "declined_general_knowledge",
      decline_other_entity_or_product: "declined_other_entity",
      decline_other_review_platform: "declined_other_platform",
    });

    expect(qaOutcomeForScopeGuardCategory("decline_unrelated_general_knowledge")).toBe(
      "declined_general_knowledge",
    );
  });

  it("rejects an unknown category instead of silently returning no outcome", () => {
    expect(() => qaOutcomeForScopeGuardCategory("unknown_category" as never)).toThrow(
      "Unknown scope-guard category: unknown_category",
    );
  });

  it("reuses expectDeclined for the correct general-knowledge outcome", () => {
    expect(assessGeneralKnowledgeQaAnswer(qaAnswer(), clearScope)).toEqual({
      declined: true,
      activeReviewScopeIsClear: true,
      scopeAssessmentMethod: "human_review",
    });
  });

  it.each<QaOutcome>([
    "answered",
    "insufficient_evidence",
    "declined_other_entity",
    "declined_other_platform",
  ])("fails the refusal criterion for outcome %s", (outcome) => {
    expect(assessGeneralKnowledgeQaAnswer(qaAnswer({ outcome }), clearScope).declined).toBe(false);
  });

  it("fails the refusal criterion when a decline carries citations", () => {
    const assessment = assessGeneralKnowledgeQaAnswer(
      qaAnswer({ citedReviewIds: [scopeGuardEvaluationFixture.persistedReviews[0].id] }),
      clearScope,
    );

    expect(assessment.declined).toBe(false);
  });

  it("keeps scope clarity independent from the machine-readable outcome", () => {
    const assessment = assessGeneralKnowledgeQaAnswer(qaAnswer({ answer: "No." }), {
      activeReviewScopeIsClear: false,
      method: "human_review",
    });

    expect(assessment).toEqual({
      declined: true,
      activeReviewScopeIsClear: false,
      scopeAssessmentMethod: "human_review",
    });
  });

  it("passes only when every real case is declined and independently explains the scope", async () => {
    const askQuestion = jest.fn(async (_question: string) => qaAnswer());

    await expect(
      evaluateGeneralKnowledgeRefusals({
        cases: generalKnowledgeCases,
        askQuestion,
        assessResponse: (answer) => assessGeneralKnowledgeQaAnswer(answer, clearScope),
      }),
    ).resolves.toEqual({
      passed: true,
      results: generalKnowledgeCases.map(({ id }) => ({
        caseId: id,
        failures: [],
        passed: true,
      })),
    });

    expect(askQuestion).toHaveBeenCalledTimes(4);
    expect(askQuestion.mock.calls.map(([question]) => question)).toEqual(
      generalKnowledgeCases.map(({ question }) => question),
    );
  });

  it("reports refusal and scope-clarity failures independently", async () => {
    const cases = generalKnowledgeCases.slice(0, 2);
    const observations: GeneralKnowledgeRefusalObservation[] = [
      {
        declined: false,
        activeReviewScopeIsClear: true,
        scopeAssessmentMethod: "human_review",
      },
      {
        declined: true,
        activeReviewScopeIsClear: false,
        scopeAssessmentMethod: "approved_semantic_evaluator",
      },
    ];

    const evaluation = await evaluateGeneralKnowledgeRefusals({
      cases,
      askQuestion: async () => qaAnswer(),
      assessResponse: () => observations.shift()!,
    });

    expect(evaluation).toEqual({
      passed: false,
      results: [
        {
          caseId: cases[0].id,
          failures: ["question_was_not_declined"],
          passed: false,
        },
        {
          caseId: cases[1].id,
          failures: ["active_review_scope_was_not_clear"],
          passed: false,
        },
      ],
    });
  });

  it("records safe invocation and assessment diagnostics and continues", async () => {
    const cases = generalKnowledgeCases.slice(0, 2);
    const askQuestion = jest
      .fn<Promise<QaAnswer>, [string]>()
      .mockRejectedValueOnce(new Error("sensitive provider detail"))
      .mockResolvedValueOnce(qaAnswer());
    const assessResponse = jest.fn(() => {
      throw new Error("sensitive response content");
    });

    const evaluation = await evaluateGeneralKnowledgeRefusals({
      cases,
      askQuestion,
      assessResponse,
    });

    expect(evaluation).toEqual({
      passed: false,
      results: [
        {
          caseId: cases[0].id,
          failures: ["question_execution_failed"],
          passed: false,
          diagnostic: {
            stage: "question_execution",
            message: "The Q&A boundary failed before a response could be assessed.",
          },
        },
        {
          caseId: cases[1].id,
          failures: ["response_assessment_failed"],
          passed: false,
          diagnostic: {
            stage: "response_assessment",
            message: "The response could not be assessed against the refusal criteria.",
          },
        },
      ],
    });
    expect(JSON.stringify(evaluation)).not.toContain("sensitive");
    expect(askQuestion).toHaveBeenCalledTimes(2);
    expect(assessResponse).toHaveBeenCalledTimes(1);
  });

  it.each([
    undefined,
    {},
    { declined: true, activeReviewScopeIsClear: true },
    {
      declined: "yes",
      activeReviewScopeIsClear: true,
      scopeAssessmentMethod: "human_review",
    },
  ])("fails closed for a malformed observation: %#", async (observation) => {
    const evaluation = await evaluateGeneralKnowledgeRefusals({
      cases: generalKnowledgeCases.slice(0, 1),
      askQuestion: async () => qaAnswer(),
      assessResponse: () => observation as never,
    });

    expect(evaluation.results[0]).toMatchObject({
      failures: ["response_assessment_failed"],
      passed: false,
      diagnostic: { stage: "response_assessment" },
    });
  });

  it.each([
    {
      cases: [],
      message: "At least one general-knowledge refusal case is required.",
    },
    {
      cases: [{ ...generalKnowledgeCases[0], id: " " }],
      message: "General-knowledge refusal case IDs must not be blank.",
    },
    {
      cases: [{ ...generalKnowledgeCases[0], question: " " }],
      message: `General-knowledge refusal case ${generalKnowledgeCases[0].id} must include a question.`,
    },
    {
      cases: [generalKnowledgeCases[0], generalKnowledgeCases[0]],
      message: `Duplicate general-knowledge refusal case ID: ${generalKnowledgeCases[0].id}`,
    },
  ])("rejects an invalid case set before invoking Q&A: $message", async ({ cases, message }) => {
    const askQuestion = jest.fn(async () => qaAnswer());

    await expect(
      evaluateGeneralKnowledgeRefusals({
        cases: cases as readonly GeneralKnowledgeRefusalCase[],
        askQuestion,
        assessResponse: (answer) => assessGeneralKnowledgeQaAnswer(answer, clearScope),
      }),
    ).rejects.toThrow(message);

    expect(askQuestion).not.toHaveBeenCalled();
  });
});
