/** @jest-environment node */

import {
  GENERAL_KNOWLEDGE_REFUSAL_CATEGORY,
  evaluateGeneralKnowledgeRefusals,
  selectGeneralKnowledgeRefusalCases,
  type GeneralKnowledgeRefusalCase,
} from "../../helpers/general-knowledge-refusal";

const generalKnowledgeCases = [
  {
    id: "general-case-001",
    question: "Synthetic unrelated question one",
    expectedCategory: GENERAL_KNOWLEDGE_REFUSAL_CATEGORY,
  },
  {
    id: "general-case-002",
    question: "Synthetic unrelated question two",
    expectedCategory: GENERAL_KNOWLEDGE_REFUSAL_CATEGORY,
  },
] as const satisfies readonly GeneralKnowledgeRefusalCase[];

describe("general-knowledge refusal evaluation helper", () => {
  it("selects the S2-004 general-knowledge category without duplicating its questions", () => {
    const selected = selectGeneralKnowledgeRefusalCases([
      ...generalKnowledgeCases,
      {
        id: "supported-case-001",
        question: "Synthetic supported question",
        expectedCategory: "answer_from_active_reviews",
      },
    ]);

    expect(selected).toEqual(generalKnowledgeCases);
  });

  it("passes only when every question is declined and the active-review scope is clear", async () => {
    const askQuestion = jest.fn(async (question: string) => ({ question, outcome: "declined" }));
    const assessResponse = jest.fn(() => ({
      declined: true,
      activeReviewScopeIsClear: true,
    }));

    await expect(
      evaluateGeneralKnowledgeRefusals({
        cases: generalKnowledgeCases,
        askQuestion,
        assessResponse,
      }),
    ).resolves.toEqual({
      passed: true,
      results: [
        { caseId: "general-case-001", failures: [], passed: true },
        { caseId: "general-case-002", failures: [], passed: true },
      ],
    });

    expect(askQuestion).toHaveBeenNthCalledWith(1, "Synthetic unrelated question one");
    expect(askQuestion).toHaveBeenNthCalledWith(2, "Synthetic unrelated question two");
    expect(assessResponse).toHaveBeenCalledTimes(2);
  });

  it("reports answering and unclear-scope failures independently", async () => {
    const observations = [
      { declined: false, activeReviewScopeIsClear: true },
      { declined: true, activeReviewScopeIsClear: false },
    ];

    const evaluation = await evaluateGeneralKnowledgeRefusals({
      cases: generalKnowledgeCases,
      askQuestion: async () => ({ controlledResponse: true }),
      assessResponse: () => observations.shift()!,
    });

    expect(evaluation).toEqual({
      passed: false,
      results: [
        {
          caseId: "general-case-001",
          failures: ["question_was_not_declined"],
          passed: false,
        },
        {
          caseId: "general-case-002",
          failures: ["active_review_scope_was_not_clear"],
          passed: false,
        },
      ],
    });
  });

  it("records invocation and assessment errors per case and continues the evaluation", async () => {
    const askQuestion = jest
      .fn<Promise<{ caseNumber: number }>, [string]>()
      .mockRejectedValueOnce(new Error("Q&A boundary unavailable"))
      .mockResolvedValueOnce({ caseNumber: 2 });
    const assessResponse = jest.fn(() => {
      throw new Error("Response contract unavailable");
    });

    await expect(
      evaluateGeneralKnowledgeRefusals({
        cases: generalKnowledgeCases,
        askQuestion,
        assessResponse,
      }),
    ).resolves.toEqual({
      passed: false,
      results: [
        {
          caseId: "general-case-001",
          failures: ["question_execution_failed"],
          passed: false,
        },
        {
          caseId: "general-case-002",
          failures: ["response_assessment_failed"],
          passed: false,
        },
      ],
    });

    expect(askQuestion).toHaveBeenCalledTimes(2);
    expect(assessResponse).toHaveBeenCalledTimes(1);
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
      message: "General-knowledge refusal case general-case-001 must include a question.",
    },
    {
      cases: [generalKnowledgeCases[0], generalKnowledgeCases[0]],
      message: "Duplicate general-knowledge refusal case ID: general-case-001",
    },
  ])("rejects an invalid case set before invoking Q&A: $message", async ({ cases, message }) => {
    const askQuestion = jest.fn(async () => ({ controlledResponse: true }));

    await expect(
      evaluateGeneralKnowledgeRefusals({
        cases,
        askQuestion,
        assessResponse: () => ({ declined: true, activeReviewScopeIsClear: true }),
      }),
    ).rejects.toThrow(message);

    expect(askQuestion).not.toHaveBeenCalled();
  });
});
