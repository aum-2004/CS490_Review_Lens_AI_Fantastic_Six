/** @jest-environment node */

import { createClient } from "@supabase/supabase-js";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAuthenticatedUser } from "@/services/auth/auth-service";
import { answerQuestion } from "@/services/qa/answer-question";
import { buildReviewDatasetContext } from "@/services/qa/review-context";
import { QaResponseError, type QaAnswer } from "@/services/qa/qa-response";
import { resolveDeclineOutcome, SYSTEM_PROMPT_VERSION } from "@/services/qa/system-prompt";
import { getQaDataset } from "../../../fixtures/qa/datasets";
import { scopeGuardEvaluationFixture } from "../../../fixtures/scope-guard-evaluation";
import {
  ENTITY_PLATFORM_DECLINE_OUTCOMES,
  evaluateEntityPlatformRefusals,
  selectEntityPlatformRefusalCases,
  type EntityPlatformRefusalCase,
  type EntityPlatformRefusalObservation,
} from "../../../helpers/entity-platform-refusal";
import {
  createFakeQaModel,
  expectContextOnlyForTarget,
  expectDeclined,
  expectNoReviewerIdentity,
  expectSystemPromptApplied,
  installNetworkGuard,
  reply,
  type FakeQaModel,
  type NetworkGuard,
  type QaReplySpec,
} from "../../../helpers/qa-harness";

jest.mock("server-only", () => ({}));
jest.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: jest.fn() }));
jest.mock("@/services/auth/auth-service", () => ({ getAuthenticatedUser: jest.fn() }));

const dataset = getQaDataset("restaurantA");
const refusalCases = selectEntityPlatformRefusalCases(scopeGuardEvaluationFixture.cases);
const entityCases = refusalCases.filter(
  ({ expectedCategory }) => expectedCategory === "decline_other_entity_or_product",
);
const platformCases = refusalCases.filter(
  ({ expectedCategory }) => expectedCategory === "decline_other_review_platform",
);
const SCOPE_CLEAR_ANSWER = "I can only analyze the Google Maps reviews for Restaurant A.";

/**
 * Recorded human judgment about the fixed reply above. These semantic facts are deliberately not
 * inferred from the machine-readable outcome or from a keyword classifier.
 */
const CLEAR_REFUSAL_ASSESSMENT = {
  declined: true,
  activeTargetScopeIsClear: true,
  activePlatformScopeIsClear: true,
  unsupportedEntityInformationWasPresented: false,
  unsupportedPlatformReviewsWereTreatedAsAvailable: false,
  unsupportedComparisonWasPresentedAsSupported: false,
} as const satisfies EntityPlatformRefusalObservation;

type SemanticAssessor = (
  answer: QaAnswer,
  evaluationCase: EntityPlatformRefusalCase,
) => EntityPlatformRefusalObservation | Promise<EntityPlatformRefusalObservation>;

function persistedDatabase() {
  const targetRow = {
    id: dataset.target.id,
    owner_id: dataset.owner.id,
    name: dataset.target.name,
    platform: dataset.target.platform,
    source_url: dataset.target.sourceUrl,
    google_place_id: dataset.target.googlePlaceId,
    created_at: dataset.target.createdAt,
  };
  const reviewRows = dataset.reviews.map((review) => ({
    id: review.id,
    analysis_target_id: review.analysisTargetId,
    review_text: review.text,
    rating: review.rating,
    review_date: review.reviewDate,
    created_at: review.createdAt,
  }));
  const requests: URL[] = [];
  const fetcher: typeof fetch = async (input) => {
    const url = new URL(String(input));
    requests.push(url);
    const isReviewQuery = url.pathname.endsWith("/reviews");
    let rows: Record<string, unknown>[] = isReviewQuery ? reviewRows : [targetRow];

    for (const [key, value] of url.searchParams) {
      if (value.startsWith("eq.")) {
        rows = rows.filter((row) => row[key] === value.slice(3));
      }
    }

    const columns = url.searchParams.get("select")!.split(",");
    const selectedRows = rows.map((row) =>
      Object.fromEntries(columns.map((column) => [column, row[column]])),
    );
    const headers = isReviewQuery
      ? {
          "Content-Range": selectedRows.length
            ? `0-${selectedRows.length - 1}/${rows.length}`
            : "*/0",
        }
      : undefined;
    return new Response(JSON.stringify(selectedRows), { status: 200, headers });
  };

  const client = createClient("http://s2-015.fixture", "fixture-publishable-key", {
    global: { fetch: fetcher },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  jest.mocked(createSupabaseServerClient).mockResolvedValue(client);
  return { requests };
}

async function evaluateCases(
  selectedCases: readonly EntityPlatformRefusalCase[],
  model: FakeQaModel,
  assessResponse: SemanticAssessor = () => CLEAR_REFUSAL_ASSESSMENT,
) {
  const answers: QaAnswer[] = [];
  const executionErrors: unknown[] = [];
  const evaluation = await evaluateEntityPlatformRefusals({
    cases: selectedCases,
    askQuestion: async (question) => {
      try {
        return await answerQuestion(dataset.target.id, question, {
          buildReviewDatasetContext,
          callModel: model.callModel,
        });
      } catch (error) {
        executionErrors.push(error);
        throw error;
      }
    },
    assessResponse: async (answer, evaluationCase) => {
      answers.push(answer);
      return assessResponse(answer, evaluationCase);
    },
  });
  return { answers, evaluation, executionErrors };
}

function modelFor(evaluationCase: EntityPlatformRefusalCase, response: QaReplySpec) {
  return createFakeQaModel({
    rules: [
      {
        name: evaluationCase.id,
        when: { targetId: dataset.target.id, question: evaluationCase.question },
        then: response,
        times: 1,
      },
    ],
  });
}

let network: NetworkGuard;
let database: ReturnType<typeof persistedDatabase>;

beforeEach(() => {
  jest.resetAllMocks();
  jest.mocked(getAuthenticatedUser).mockResolvedValue(dataset.owner);
  database = persistedDatabase();
  network = installNetworkGuard();
});

afterEach(() => {
  try {
    network.assertNoAttempts();
  } finally {
    network.restore();
  }
});

describe("S2-015 real answerQuestion integration", () => {
  it("preserves all six S2-004 classifications, including the three named external entities", () => {
    expect(refusalCases.map(({ id, expectedCategory }) => ({ id, expectedCategory }))).toEqual([
      { id: "sg-other-entity-001", expectedCategory: "decline_other_entity_or_product" },
      { id: "sg-other-entity-002", expectedCategory: "decline_other_entity_or_product" },
      { id: "sg-other-entity-003", expectedCategory: "decline_other_entity_or_product" },
      { id: "sg-other-platform-001", expectedCategory: "decline_other_review_platform" },
      { id: "sg-other-platform-002", expectedCategory: "decline_other_review_platform" },
      { id: "sg-other-platform-003", expectedCategory: "decline_other_review_platform" },
    ]);
    expect(
      entityCases.map((evaluationCase) => ({
        id: evaluationCase.id,
        outcome: ENTITY_PLATFORM_DECLINE_OUTCOMES[evaluationCase.expectedCategory],
      })),
    ).toEqual([
      { id: "sg-other-entity-001", outcome: "declined_other_entity" },
      { id: "sg-other-entity-002", outcome: "declined_other_entity" },
      { id: "sg-other-entity-003", outcome: "declined_other_entity" },
    ]);
  });

  it("runs all six cases through context, answerQuestion, parsing, and evaluation", async () => {
    const model = createFakeQaModel({
      rules: refusalCases.map((evaluationCase) => ({
        name: evaluationCase.id,
        when: { targetId: dataset.target.id, question: evaluationCase.question },
        then: reply.declined(
          ENTITY_PLATFORM_DECLINE_OUTCOMES[evaluationCase.expectedCategory],
          SCOPE_CLEAR_ANSWER,
        ),
        times: 1,
      })),
    });

    const { answers, evaluation, executionErrors } = await evaluateCases(refusalCases, model);

    expect(executionErrors).toEqual([]);
    expect(evaluation).toEqual({
      passed: true,
      results: refusalCases.map(({ id }) => ({ caseId: id, failures: [], passed: true })),
    });
    expect(answers).toHaveLength(6);
    for (const [index, answer] of answers.entries()) {
      const evaluationCase = refusalCases[index];
      expect(answer).toEqual({
        outcome: ENTITY_PLATFORM_DECLINE_OUTCOMES[evaluationCase.expectedCategory],
        answer: SCOPE_CLEAR_ANSWER,
        citedReviewIds: [],
        promptVersion: SYSTEM_PROMPT_VERSION,
        targetId: dataset.target.id,
      });
      expectDeclined(answer, ENTITY_PLATFORM_DECLINE_OUTCOMES[evaluationCase.expectedCategory]);
    }

    expect(model.calls).toHaveLength(6);
    for (const [index, call] of model.calls.entries()) {
      expect(call.matchedRule).toBe(refusalCases[index].id);
      expect(call.question).toBe(refusalCases[index].question);
      expectSystemPromptApplied(call.request, dataset, {
        promptVersion: SYSTEM_PROMPT_VERSION,
      });
      expectContextOnlyForTarget(call.request, dataset);
      expectNoReviewerIdentity(call.request, dataset);
      expect(JSON.stringify(call.request)).not.toMatch(
        /sourceReviewId|reviewerName|reviewUrl|sourceMetadata|sourceUrl|evidenceJson/,
      );
    }
    expect(database.requests).toHaveLength(12);
    expect(
      database.requests.filter(({ pathname }) => /analysis_targets$/.test(pathname)),
    ).toHaveLength(6);
    expect(database.requests.filter(({ pathname }) => /reviews$/.test(pathname))).toHaveLength(6);
    expect(network.attempts).toEqual([]);
  });

  it("runs the mixed entity/platform case through entity-first production validation", async () => {
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
    const model = modelFor(mixedCase, reply.declined(expectedOutcome, SCOPE_CLEAR_ANSWER));

    const { answers, evaluation } = await evaluateCases([mixedCase], model);

    expect(expectedOutcome).toBe("declined_other_entity");
    expect(answers[0]).toMatchObject({
      outcome: "declined_other_entity",
      citedReviewIds: [],
      promptVersion: SYSTEM_PROMPT_VERSION,
    });
    expect(evaluation.results[0]).toEqual({
      caseId: mixedCase.id,
      failures: [],
      passed: true,
    });
  });

  it("fails the mixed case when production returns platform-first priority", async () => {
    const mixedCase = {
      id: "s2-015-mixed-wrong-priority",
      question: "How does Restaurant A compare with Restaurant B based on Amazon reviews?",
      expectedCategory: "decline_other_entity_or_product",
      expectedReviewIds: [],
      explanation: "Entity scope must win when both entity and platform scope are unsupported.",
    } as const satisfies EntityPlatformRefusalCase;
    const model = modelFor(
      mixedCase,
      reply.declined("declined_other_platform", SCOPE_CLEAR_ANSWER),
    );

    const { answers, evaluation } = await evaluateCases([mixedCase], model);

    expect(answers[0]).toMatchObject({ outcome: "declined_other_platform", citedReviewIds: [] });
    expect(evaluation.results[0]).toEqual({
      caseId: mixedCase.id,
      failures: ["structured_decline_contract_failed"],
      passed: false,
    });
  });

  it.each([
    ["answered entity question", entityCases[0], reply.answered([dataset.reviews[0].id])],
    ["answered platform question", platformCases[0], reply.answered([dataset.reviews[0].id])],
    [
      "platform outcome for entity question",
      entityCases[0],
      reply.declined("declined_other_platform", SCOPE_CLEAR_ANSWER),
    ],
    [
      "entity outcome for platform question",
      platformCases[0],
      reply.declined("declined_other_entity", SCOPE_CLEAR_ANSWER),
    ],
  ] as const)(
    "fails evaluation for a production-validated %s",
    async (_label, evaluationCase, response) => {
      const model = modelFor(evaluationCase, response);

      const { answers, evaluation, executionErrors } = await evaluateCases([evaluationCase], model);

      expect(executionErrors).toEqual([]);
      expect(answers).toHaveLength(1);
      expect(evaluation.results[0]).toEqual({
        caseId: evaluationCase.id,
        failures: ["structured_decline_contract_failed"],
        passed: false,
      });
    },
  );

  it.each([entityCases[0], platformCases[0]])(
    "rejects cited decline payloads for $id in production response validation",
    async (evaluationCase) => {
      const model = modelFor(
        evaluationCase,
        reply.payload({
          outcome: ENTITY_PLATFORM_DECLINE_OUTCOMES[evaluationCase.expectedCategory],
          answer: SCOPE_CLEAR_ANSWER,
          citedReviewIds: [dataset.reviews[0].id],
        }),
      );

      const { answers, evaluation, executionErrors } = await evaluateCases([evaluationCase], model);

      expect(executionErrors[0]).toBeInstanceOf(QaResponseError);
      expect(executionErrors[0]).toMatchObject({ code: "UNEXPECTED_CITATIONS" });
      expect(answers).toEqual([]);
      expect(evaluation.results[0]).toEqual({
        caseId: evaluationCase.id,
        failures: ["question_execution_failed"],
        passed: false,
      });
    },
  );

  it("rejects a malformed model reply without leaking it into evaluation results", async () => {
    const evaluationCase = entityCases[0];
    const malformedReply = "S2_015_PRIVATE_MALFORMED_REPLY";
    const model = modelFor(evaluationCase, reply.raw(malformedReply));

    const { answers, evaluation, executionErrors } = await evaluateCases([evaluationCase], model);

    expect(executionErrors[0]).toBeInstanceOf(QaResponseError);
    expect(executionErrors[0]).toMatchObject({ code: "INVALID_MODEL_RESPONSE" });
    expect(answers).toEqual([]);
    expect(evaluation.results[0]).toEqual({
      caseId: evaluationCase.id,
      failures: ["question_execution_failed"],
      passed: false,
    });
    expect(JSON.stringify(evaluation)).not.toContain(malformedReply);
  });

  it.each([
    [
      "unclear active target",
      entityCases[0],
      { ...CLEAR_REFUSAL_ASSESSMENT, activeTargetScopeIsClear: false },
      "active_target_scope_was_not_clear",
    ],
    [
      "unclear active platform",
      platformCases[0],
      { ...CLEAR_REFUSAL_ASSESSMENT, activePlatformScopeIsClear: false },
      "active_platform_scope_was_not_clear",
    ],
    [
      "unsupported entity information",
      entityCases[0],
      { ...CLEAR_REFUSAL_ASSESSMENT, unsupportedEntityInformationWasPresented: true },
      "unsupported_entity_information_was_presented",
    ],
    [
      "unsupported platform reviews",
      platformCases[0],
      { ...CLEAR_REFUSAL_ASSESSMENT, unsupportedPlatformReviewsWereTreatedAsAvailable: true },
      "unsupported_platform_reviews_were_treated_as_available",
    ],
    [
      "unsupported comparison",
      entityCases[0],
      { ...CLEAR_REFUSAL_ASSESSMENT, unsupportedComparisonWasPresentedAsSupported: true },
      "unsupported_comparison_was_presented_as_supported",
    ],
  ] as const)(
    "keeps $label independent from a valid production decline",
    async (_label, evaluationCase, assessment, expectedFailure) => {
      const model = modelFor(
        evaluationCase,
        reply.declined(
          ENTITY_PLATFORM_DECLINE_OUTCOMES[evaluationCase.expectedCategory],
          SCOPE_CLEAR_ANSWER,
        ),
      );

      const { answers, evaluation } = await evaluateCases(
        [evaluationCase],
        model,
        () => assessment,
      );

      expect(answers[0]).toMatchObject({
        outcome: ENTITY_PLATFORM_DECLINE_OUTCOMES[evaluationCase.expectedCategory],
        citedReviewIds: [],
      });
      expect(evaluation.results[0]).toEqual({
        caseId: evaluationCase.id,
        failures: [expectedFailure],
        passed: false,
      });
    },
  );

  it("isolates a production parsing failure and continues with the next case", async () => {
    const selectedCases = [entityCases[0], platformCases[0]] as const;
    const model = createFakeQaModel({
      rules: [
        {
          name: selectedCases[0].id,
          when: { question: selectedCases[0].question },
          then: reply.raw("not JSON"),
          times: 1,
        },
        {
          name: selectedCases[1].id,
          when: { question: selectedCases[1].question },
          then: reply.declined("declined_other_platform", SCOPE_CLEAR_ANSWER),
          times: 1,
        },
      ],
    });

    const { answers, evaluation, executionErrors } = await evaluateCases(selectedCases, model);

    expect(executionErrors[0]).toMatchObject({ code: "INVALID_MODEL_RESPONSE" });
    expect(answers).toHaveLength(1);
    expect(evaluation.results).toEqual([
      {
        caseId: selectedCases[0].id,
        failures: ["question_execution_failed"],
        passed: false,
      },
      { caseId: selectedCases[1].id, failures: [], passed: true },
    ]);
    expect(model.calls).toHaveLength(2);
  });
});
