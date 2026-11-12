/** @jest-environment node */

import {
  ENTITY_PLATFORM_REFUSAL_CATEGORIES,
  evaluateEntityPlatformRefusals,
  selectEntityPlatformRefusalCases,
  type EntityPlatformRefusalCase,
  type EntityPlatformRefusalObservation,
} from "../../helpers/entity-platform-refusal";

const refusalCases = [
  {
    id: "other-entity-case-001",
    question: "Synthetic unsupported entity question",
    expectedCategory: "decline_other_entity_or_product",
  },
  {
    id: "other-platform-case-001",
    question: "Synthetic unsupported platform question",
    expectedCategory: "decline_other_review_platform",
  },
] as const satisfies readonly EntityPlatformRefusalCase[];

const properRefusal: EntityPlatformRefusalObservation = {
  declined: true,
  activeTargetScopeIsClear: true,
  activePlatformScopeIsClear: true,
  unsupportedEntityInformationWasPresented: false,
  unsupportedPlatformReviewsWereTreatedAsAvailable: false,
  unsupportedComparisonWasPresentedAsSupported: false,
};

describe("entity/platform refusal evaluation helper", () => {
  it("selects both S2-015 categories and excludes unrelated S2-004 categories", () => {
    const selected = selectEntityPlatformRefusalCases([
      ...refusalCases,
      {
        id: "supported-case-001",
        question: "Synthetic supported question",
        expectedCategory: "answer_from_active_reviews",
      },
      {
        id: "general-case-001",
        question: "Synthetic general-knowledge question",
        expectedCategory: "decline_unrelated_general_knowledge",
      },
    ]);

    expect(ENTITY_PLATFORM_REFUSAL_CATEGORIES).toEqual([
      "decline_other_entity_or_product",
      "decline_other_review_platform",
    ]);
    expect(selected).toEqual(refusalCases);
  });

  it("passes only when every response properly declines and clarifies the active scope", async () => {
    const askQuestion = jest.fn(async (question: string) => ({ question, outcome: "declined" }));
    const assessResponse = jest.fn(() => properRefusal);

    await expect(
      evaluateEntityPlatformRefusals({ cases: refusalCases, askQuestion, assessResponse }),
    ).resolves.toEqual({
      passed: true,
      results: [
        { caseId: "other-entity-case-001", failures: [], passed: true },
        { caseId: "other-platform-case-001", failures: [], passed: true },
      ],
    });

    expect(askQuestion).toHaveBeenNthCalledWith(1, "Synthetic unsupported entity question");
    expect(askQuestion).toHaveBeenNthCalledWith(2, "Synthetic unsupported platform question");
    expect(assessResponse).toHaveBeenNthCalledWith(
      1,
      {
        question: "Synthetic unsupported entity question",
        outcome: "declined",
      },
      refusalCases[0],
    );
    expect(assessResponse).toHaveBeenNthCalledWith(
      2,
      {
        question: "Synthetic unsupported platform question",
        outcome: "declined",
      },
      refusalCases[1],
    );
  });

  it("fails when an unsupported entity question is answered", async () => {
    const evaluation = await evaluateEntityPlatformRefusals({
      cases: [refusalCases[0]],
      askQuestion: async () => ({ answer: "Fabricated information about another entity" }),
      assessResponse: () => ({
        ...properRefusal,
        declined: false,
        unsupportedEntityInformationWasPresented: true,
      }),
    });

    expect(evaluation.results[0]).toEqual({
      caseId: "other-entity-case-001",
      failures: ["question_was_not_declined", "unsupported_entity_information_was_presented"],
      passed: false,
    });
  });

  it("fails when unsupported platform reviews are treated as available", async () => {
    const evaluation = await evaluateEntityPlatformRefusals({
      cases: [refusalCases[1]],
      askQuestion: async () => ({ answer: "Fabricated review-platform summary" }),
      assessResponse: () => ({
        ...properRefusal,
        declined: false,
        unsupportedPlatformReviewsWereTreatedAsAvailable: true,
      }),
    });

    expect(evaluation.results[0]).toEqual({
      caseId: "other-platform-case-001",
      failures: [
        "question_was_not_declined",
        "unsupported_platform_reviews_were_treated_as_available",
      ],
      passed: false,
    });
  });

  it("fails when an unsupported comparison is presented as evidence-backed", async () => {
    const evaluation = await evaluateEntityPlatformRefusals({
      cases: [refusalCases[0]],
      askQuestion: async () => ({ answer: "Unsupported comparison" }),
      assessResponse: () => ({
        ...properRefusal,
        declined: false,
        unsupportedComparisonWasPresentedAsSupported: true,
      }),
    });

    expect(evaluation.results[0]).toEqual({
      caseId: "other-entity-case-001",
      failures: ["question_was_not_declined", "unsupported_comparison_was_presented_as_supported"],
      passed: false,
    });
  });

  it("reports unclear active-target and active-platform scope independently", async () => {
    const evaluation = await evaluateEntityPlatformRefusals({
      cases: refusalCases,
      askQuestion: async () => ({ outcome: "declined" }),
      assessResponse: (_response, evaluationCase) => ({
        ...properRefusal,
        activeTargetScopeIsClear: evaluationCase === refusalCases[1],
        activePlatformScopeIsClear: evaluationCase === refusalCases[0],
      }),
    });

    expect(evaluation).toEqual({
      passed: false,
      results: [
        {
          caseId: "other-entity-case-001",
          failures: ["active_target_scope_was_not_clear"],
          passed: false,
        },
        {
          caseId: "other-platform-case-001",
          failures: ["active_platform_scope_was_not_clear"],
          passed: false,
        },
      ],
    });
  });

  it("records invocation and assessment errors per case and continues evaluation", async () => {
    const askQuestion = jest
      .fn<Promise<{ caseNumber: number }>, [string]>()
      .mockRejectedValueOnce(new Error("Q&A boundary unavailable"))
      .mockResolvedValueOnce({ caseNumber: 2 });
    const assessResponse = jest.fn(() => {
      throw new Error("Semantic assessor unavailable");
    });

    await expect(
      evaluateEntityPlatformRefusals({ cases: refusalCases, askQuestion, assessResponse }),
    ).resolves.toEqual({
      passed: false,
      results: [
        {
          caseId: "other-entity-case-001",
          failures: ["question_execution_failed"],
          passed: false,
        },
        {
          caseId: "other-platform-case-001",
          failures: ["response_assessment_failed"],
          passed: false,
        },
      ],
    });

    expect(askQuestion).toHaveBeenCalledTimes(2);
    expect(assessResponse).toHaveBeenCalledTimes(1);
  });

  it("rejects a malformed semantic observation instead of trusting it as a pass", async () => {
    const evaluation = await evaluateEntityPlatformRefusals({
      cases: [refusalCases[0]],
      askQuestion: async () => ({ outcome: "declined" }),
      assessResponse: async () =>
        ({
          declined: true,
          activeTargetScopeIsClear: true,
        }) as EntityPlatformRefusalObservation,
    });

    expect(evaluation.results[0]).toEqual({
      caseId: "other-entity-case-001",
      failures: ["response_assessment_failed"],
      passed: false,
    });
  });

  it.each([
    {
      cases: [],
      message: "At least one entity/platform refusal case is required.",
    },
    {
      cases: [{ ...refusalCases[0], id: " " }],
      message: "Entity/platform refusal case IDs must not be blank.",
    },
    {
      cases: [{ ...refusalCases[0], question: " " }],
      message: "Entity/platform refusal case other-entity-case-001 must include a question.",
    },
    {
      cases: [
        {
          ...refusalCases[0],
          expectedCategory: "answer_from_active_reviews",
        } as unknown as EntityPlatformRefusalCase,
      ],
      message:
        "Entity/platform refusal case other-entity-case-001 has an unsupported category: answer_from_active_reviews",
    },
    {
      cases: [refusalCases[0], refusalCases[0]],
      message: "Duplicate entity/platform refusal case ID: other-entity-case-001",
    },
    {
      cases: [
        refusalCases[0],
        {
          ...refusalCases[1],
          question: `  ${refusalCases[0].question.toUpperCase()}  `,
        },
      ],
      message: `Duplicate entity/platform refusal case question: ${refusalCases[0].question.toUpperCase()}`,
    },
  ])("rejects invalid cases before invoking Q&A: $message", async ({ cases, message }) => {
    const askQuestion = jest.fn(async () => ({ controlledResponse: true }));

    await expect(
      evaluateEntityPlatformRefusals({
        cases,
        askQuestion,
        assessResponse: () => properRefusal,
      }),
    ).rejects.toThrow(message);

    expect(askQuestion).not.toHaveBeenCalled();
  });
});
