/** @jest-environment node */

import { resolveDeclineOutcome } from "@/services/qa/system-prompt";
import { scopeGuardEvaluationFixture } from "../../fixtures/scope-guard-evaluation";
import {
  ENTITY_PLATFORM_DECLINE_OUTCOMES,
  ENTITY_PLATFORM_REFUSAL_CATEGORIES,
  evaluateEntityPlatformRefusals,
  selectEntityPlatformRefusalCases,
  type EntityPlatformRefusalCase,
  type EntityPlatformRefusalObservation,
} from "../../helpers/entity-platform-refusal";
import type { QaAnswer, QaOutcome } from "../../helpers/qa-harness";

const refusalCases = selectEntityPlatformRefusalCases(scopeGuardEvaluationFixture.cases);
const entityCase = refusalCases.find(
  ({ expectedCategory }) => expectedCategory === "decline_other_entity_or_product",
)!;
const platformCase = refusalCases.find(
  ({ expectedCategory }) => expectedCategory === "decline_other_review_platform",
)!;

function answer(outcome: QaOutcome, citedReviewIds: string[] = []): QaAnswer {
  return {
    outcome,
    answer: "I can only analyze the active target's Google Maps reviews.",
    citedReviewIds,
    promptVersion: "s2-013.v2",
    targetId: scopeGuardEvaluationFixture.activeTarget.id,
  };
}

const properRefusal: EntityPlatformRefusalObservation = {
  declined: true,
  activeTargetScopeIsClear: true,
  activePlatformScopeIsClear: true,
  unsupportedEntityInformationWasPresented: false,
  unsupportedPlatformReviewsWereTreatedAsAvailable: false,
  unsupportedComparisonWasPresentedAsSupported: false,
};

function expectedAnswer(evaluationCase: EntityPlatformRefusalCase): QaAnswer {
  return answer(ENTITY_PLATFORM_DECLINE_OUTCOMES[evaluationCase.expectedCategory]);
}

describe("entity/platform refusal evaluation helper", () => {
  it("selects all six real S2-004 entity/platform cases and excludes unrelated categories", () => {
    expect(ENTITY_PLATFORM_REFUSAL_CATEGORIES).toEqual([
      "decline_other_entity_or_product",
      "decline_other_review_platform",
    ]);
    expect(refusalCases.map(({ id }) => id)).toEqual([
      "sg-other-entity-001",
      "sg-other-entity-002",
      "sg-other-entity-003",
      "sg-other-platform-001",
      "sg-other-platform-002",
      "sg-other-platform-003",
    ]);
  });

  it("maps each S2-004 refusal category to exactly one S2-013 outcome", () => {
    expect(ENTITY_PLATFORM_DECLINE_OUTCOMES).toEqual({
      decline_other_entity_or_product: "declined_other_entity",
      decline_other_review_platform: "declined_other_platform",
    });
  });

  it("passes only when every structured response has the mapped decline and semantic scope is clear", async () => {
    const askQuestion = jest.fn(async (question: string) =>
      expectedAnswer(refusalCases.find((item) => item.question === question)!),
    );
    const assessResponse = jest.fn(() => properRefusal);
    const evaluation = await evaluateEntityPlatformRefusals({
      cases: refusalCases,
      askQuestion,
      assessResponse,
    });

    expect(evaluation).toEqual({
      passed: true,
      results: refusalCases.map(({ id }) => ({ caseId: id, failures: [], passed: true })),
    });
    expect(askQuestion).toHaveBeenCalledTimes(6);
    expect(assessResponse).toHaveBeenCalledTimes(6);
  });

  it.each([
    {
      description: "unsupported entity information is presented",
      evaluationCase: entityCase,
      observation: { ...properRefusal, unsupportedEntityInformationWasPresented: true },
      expectedFailure: "unsupported_entity_information_was_presented",
    },
    {
      description: "unsupported platform reviews are treated as available",
      evaluationCase: platformCase,
      observation: { ...properRefusal, unsupportedPlatformReviewsWereTreatedAsAvailable: true },
      expectedFailure: "unsupported_platform_reviews_were_treated_as_available",
    },
    {
      description: "an unsupported comparison is presented as supported",
      evaluationCase: entityCase,
      observation: { ...properRefusal, unsupportedComparisonWasPresentedAsSupported: true },
      expectedFailure: "unsupported_comparison_was_presented_as_supported",
    },
  ] as const)(
    "fails despite declined=true when $description",
    async ({ evaluationCase, observation, expectedFailure }) => {
      const evaluation = await evaluateEntityPlatformRefusals({
        cases: [evaluationCase],
        askQuestion: async () => expectedAnswer(evaluationCase),
        assessResponse: () => observation,
      });
      expect(evaluation.results[0]).toEqual({
        caseId: evaluationCase.id,
        failures: [expectedFailure],
        passed: false,
      });
    },
  );

  it.each([
    ["answers an entity question", entityCase, answer("answered", ["review-1"])],
    ["answers a platform question", platformCase, answer("answered", ["review-1"])],
    [
      "uses the platform outcome for an entity question",
      entityCase,
      answer("declined_other_platform"),
    ],
    [
      "uses the entity outcome for a platform question",
      platformCase,
      answer("declined_other_entity"),
    ],
    ["cites a review in a decline", entityCase, answer("declined_other_entity", ["review-1"])],
  ] as const)(
    "fails the structured decline contract when it %s",
    async (_label, evaluationCase, response) => {
      const assessResponse = jest.fn(() => properRefusal);
      const evaluation = await evaluateEntityPlatformRefusals({
        cases: [evaluationCase],
        askQuestion: async () => response,
        assessResponse,
      });

      expect(evaluation.results[0]).toEqual({
        caseId: evaluationCase.id,
        failures: ["structured_decline_contract_failed"],
        passed: false,
      });
      expect(assessResponse).toHaveBeenCalledWith(response, evaluationCase);
    },
  );

  it.each([
    {
      label: "an unsupported entity question is answered",
      evaluationCase: entityCase,
      response: answer("answered", ["review-1"]),
      observation: {
        ...properRefusal,
        declined: false,
        unsupportedEntityInformationWasPresented: true,
      },
      semanticFailures: [
        "question_was_not_declined",
        "unsupported_entity_information_was_presented",
      ],
    },
    {
      label: "unsupported platform reviews are treated as available",
      evaluationCase: platformCase,
      response: answer("answered", ["review-1"]),
      observation: {
        ...properRefusal,
        declined: false,
        unsupportedPlatformReviewsWereTreatedAsAvailable: true,
      },
      semanticFailures: [
        "question_was_not_declined",
        "unsupported_platform_reviews_were_treated_as_available",
      ],
    },
    {
      label: "an unsupported comparison is presented as evidence-backed",
      evaluationCase: entityCase,
      response: answer("answered", ["review-1"]),
      observation: {
        ...properRefusal,
        declined: false,
        unsupportedComparisonWasPresentedAsSupported: true,
      },
      semanticFailures: [
        "question_was_not_declined",
        "unsupported_comparison_was_presented_as_supported",
      ],
    },
  ] as const)(
    "preserves independent semantic failures when $label",
    async ({ evaluationCase, response, observation, semanticFailures }) => {
      const evaluation = await evaluateEntityPlatformRefusals({
        cases: [evaluationCase],
        askQuestion: async () => response,
        assessResponse: () => observation,
      });
      expect(evaluation.results[0]).toEqual({
        caseId: evaluationCase.id,
        failures: ["structured_decline_contract_failed", ...semanticFailures],
        passed: false,
      });
    },
  );

  it("fails a mixed entity/platform question when platform wins over entity priority", async () => {
    const mixedCase = {
      id: "s2-015-mixed-entity-platform",
      question: "How does Restaurant A compare with Restaurant B based on Amazon reviews?",
      expectedCategory: "decline_other_entity_or_product",
      expectedReviewIds: [],
      explanation:
        "Another entity and another platform are requested; entity scope has higher decline priority.",
    } as const satisfies EntityPlatformRefusalCase;
    const expectedOutcome = resolveDeclineOutcome([
      "declined_other_platform",
      "declined_other_entity",
    ]);

    expect(expectedOutcome).toBe("declined_other_entity");
    const evaluation = await evaluateEntityPlatformRefusals({
      cases: [mixedCase],
      askQuestion: async () => answer("declined_other_platform"),
      assessResponse: () => properRefusal,
    });
    expect(evaluation.results[0]).toEqual({
      caseId: mixedCase.id,
      failures: ["structured_decline_contract_failed"],
      passed: false,
    });
  });

  it("reports unclear active-target and active-platform scope independently", async () => {
    const cases = [entityCase, platformCase] as const;
    const evaluation = await evaluateEntityPlatformRefusals({
      cases,
      askQuestion: async (question) =>
        expectedAnswer(cases.find((item) => item.question === question)!),
      assessResponse: (_response, evaluationCase) => ({
        ...properRefusal,
        activeTargetScopeIsClear: evaluationCase === platformCase,
        activePlatformScopeIsClear: evaluationCase === entityCase,
      }),
    });
    expect(evaluation.results).toEqual([
      { caseId: entityCase.id, failures: ["active_target_scope_was_not_clear"], passed: false },
      { caseId: platformCase.id, failures: ["active_platform_scope_was_not_clear"], passed: false },
    ]);
  });

  it("records invocation and assessment errors per case and continues evaluation", async () => {
    const askQuestion = jest
      .fn<Promise<QaAnswer>, [string]>()
      .mockRejectedValueOnce(new Error("Q&A boundary unavailable"))
      .mockResolvedValueOnce(expectedAnswer(platformCase));
    const assessResponse = jest.fn(() => {
      throw new Error("Semantic assessor unavailable");
    });
    const evaluation = await evaluateEntityPlatformRefusals({
      cases: [entityCase, platformCase],
      askQuestion,
      assessResponse,
    });
    expect(evaluation.results).toEqual([
      { caseId: entityCase.id, failures: ["question_execution_failed"], passed: false },
      { caseId: platformCase.id, failures: ["response_assessment_failed"], passed: false },
    ]);
  });

  it.each([
    ["a partial object", { declined: true, activeTargetScopeIsClear: true }],
    ["null", null],
    ["a non-object value", "malformed observation"],
  ] as const)("fails closed when the semantic assessor returns %s", async (_description, value) => {
    const evaluation = await evaluateEntityPlatformRefusals({
      cases: [entityCase],
      askQuestion: async () => expectedAnswer(entityCase),
      assessResponse: async () => value as unknown as EntityPlatformRefusalObservation,
    });
    expect(evaluation.results[0]).toEqual({
      caseId: entityCase.id,
      failures: ["response_assessment_failed"],
      passed: false,
    });
  });

  it.each([
    { cases: [], message: "At least one entity/platform refusal case is required." },
    {
      cases: [{ ...entityCase, id: " " }],
      message: "Entity/platform refusal case IDs must not be blank.",
    },
    {
      cases: [{ ...entityCase, question: " " }],
      message: `Entity/platform refusal case ${entityCase.id} must include a question.`,
    },
    {
      cases: [
        {
          ...entityCase,
          expectedCategory: "answer_from_active_reviews",
        } as unknown as EntityPlatformRefusalCase,
      ],
      message: `Entity/platform refusal case ${entityCase.id} has an unsupported category: answer_from_active_reviews`,
    },
    {
      cases: [entityCase, entityCase],
      message: `Duplicate entity/platform refusal case ID: ${entityCase.id}`,
    },
    {
      cases: [
        entityCase,
        { ...platformCase, question: `  ${entityCase.question.toUpperCase()}  ` },
      ],
      message: `Duplicate entity/platform refusal case question: ${entityCase.question.toUpperCase()}`,
    },
  ])("rejects invalid cases before invoking Q&A: $message", async ({ cases, message }) => {
    const askQuestion = jest.fn(async () => expectedAnswer(entityCase));
    await expect(
      evaluateEntityPlatformRefusals({ cases, askQuestion, assessResponse: () => properRefusal }),
    ).rejects.toThrow(message);
    expect(askQuestion).not.toHaveBeenCalled();
  });
});
