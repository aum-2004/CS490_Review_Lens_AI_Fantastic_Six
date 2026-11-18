/** @jest-environment node */

import { createClient } from "@supabase/supabase-js";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAuthenticatedUser } from "@/services/auth/auth-service";
import { answerQuestion } from "@/services/qa/answer-question";
import { buildReviewDatasetContext } from "@/services/qa/review-context";
import { QaResponseError, type QaAnswer } from "@/services/qa/qa-response";
import { SYSTEM_PROMPT_VERSION } from "@/services/qa/system-prompt";
import { scopeGuardEvaluationFixture } from "../../../fixtures/scope-guard-evaluation";
import { getQaDataset } from "../../../fixtures/qa/datasets";
import {
  GENERAL_KNOWLEDGE_REFUSAL_OUTCOME,
  assessGeneralKnowledgeQaAnswer,
  evaluateGeneralKnowledgeRefusals,
  qaOutcomeForScopeGuardCategory,
  selectGeneralKnowledgeRefusalCases,
  type GeneralKnowledgeRefusalCase,
  type GeneralKnowledgeScopeAssessment,
} from "../../../helpers/general-knowledge-refusal";
import {
  claimFrom,
  createFakeQaModel,
  expectContextOnlyForTarget,
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
const cases = selectGeneralKnowledgeRefusalCases(scopeGuardEvaluationFixture.cases);
const SCOPE_CLEAR_ANSWER = "I can only analyze the Google Maps reviews for Restaurant A.";
const CLEAR_SCOPE_ASSESSMENT = {
  activeReviewScopeIsClear: true,
  method: "human_review",
} as const satisfies GeneralKnowledgeScopeAssessment;

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

  const client = createClient("http://s2-014.fixture", "fixture-publishable-key", {
    global: { fetch: fetcher },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  jest.mocked(createSupabaseServerClient).mockResolvedValue(client);
  return { requests };
}

async function evaluateCases(
  selectedCases: readonly GeneralKnowledgeRefusalCase[],
  model: FakeQaModel,
  scopeAssessment: GeneralKnowledgeScopeAssessment = CLEAR_SCOPE_ASSESSMENT,
) {
  const answers: QaAnswer[] = [];
  let executionError: unknown;
  const evaluation = await evaluateGeneralKnowledgeRefusals({
    cases: selectedCases,
    askQuestion: async (question) => {
      try {
        return await answerQuestion(dataset.target.id, question, {
          buildReviewDatasetContext,
          callModel: model.callModel,
        });
      } catch (error) {
        executionError = error;
        throw error;
      }
    },
    assessResponse: (answer) => {
      answers.push(answer);
      return assessGeneralKnowledgeQaAnswer(answer, scopeAssessment);
    },
  });

  return { answers, evaluation, executionError };
}

function modelFor(evaluationCase: GeneralKnowledgeRefusalCase, response: QaReplySpec) {
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
  network.restore();
  network.assertNoAttempts();
});

describe("S2-014 real answerQuestion integration", () => {
  it("preserves all four classifications, including open-ended restaurant recommendations", () => {
    expect(cases.map(({ id }) => id)).toEqual([
      "sg-general-001",
      "sg-general-002",
      "sg-general-003",
      "sg-general-004",
    ]);
    const recommendations = cases.find(({ id }) => id === "sg-general-004")!;
    expect(recommendations).toMatchObject({
      question: "What are the best restaurants in New York?",
      expectedCategory: "decline_unrelated_general_knowledge",
    });
    expect(qaOutcomeForScopeGuardCategory(recommendations.expectedCategory)).toBe(
      GENERAL_KNOWLEDGE_REFUSAL_OUTCOME,
    );
  });

  it("runs every case through context, answerQuestion, response validation, and evaluation", async () => {
    const model = createFakeQaModel({
      rules: cases.map((evaluationCase) => ({
        name: evaluationCase.id,
        when: { targetId: dataset.target.id, question: evaluationCase.question },
        then: reply.declined(GENERAL_KNOWLEDGE_REFUSAL_OUTCOME, SCOPE_CLEAR_ANSWER),
        times: 1,
      })),
    });

    const { answers, evaluation } = await evaluateCases(cases, model);

    expect(evaluation).toEqual({
      passed: true,
      results: cases.map(({ id }) => ({ caseId: id, failures: [], passed: true })),
    });
    expect(answers).toHaveLength(4);
    expect(
      answers.every(
        ({ outcome, citedReviewIds }) =>
          outcome === GENERAL_KNOWLEDGE_REFUSAL_OUTCOME && citedReviewIds.length === 0,
      ),
    ).toBe(true);
    expect(model.calls).toHaveLength(4);
    for (const [index, call] of model.calls.entries()) {
      expect(call.matchedRule).toBe(cases[index].id);
      expect(call.question).toBe(cases[index].question);
      expectSystemPromptApplied(call.request, dataset, { promptVersion: SYSTEM_PROMPT_VERSION });
      expectContextOnlyForTarget(call.request, dataset);
      expectNoReviewerIdentity(call.request, dataset);
    }
    expect(database.requests).toHaveLength(8);
    expect(
      database.requests.filter(({ pathname }) => /analysis_targets$/.test(pathname)),
    ).toHaveLength(4);
    expect(database.requests.filter(({ pathname }) => /reviews$/.test(pathname))).toHaveLength(4);
    expect(network.attempts).toEqual([]);
  });

  it.each([
    ["answered", reply.answered([dataset.reviews[0].id]), "question_was_not_declined"],
    ["insufficient evidence", reply.insufficientEvidence(), "question_was_not_declined"],
    ["another entity decline", reply.declined("declined_other_entity"), "wrong_decline_outcome"],
    [
      "another platform decline",
      reply.declined("declined_other_platform"),
      "wrong_decline_outcome",
    ],
  ] as const)(
    "maps %s to its distinct evaluator failure",
    async (_label, response, expectedFailure) => {
      const evaluationCase = cases[0];
      const model = modelFor(evaluationCase, response);

      const { evaluation } = await evaluateCases([evaluationCase], model);

      expect(evaluation.results[0]).toMatchObject({
        failures: [expectedFailure],
        passed: false,
      });
      expect(database.requests).toHaveLength(2);
    },
  );

  it("rejects cited declines in production response validation", async () => {
    const evaluationCase = cases[0];
    const model = modelFor(
      evaluationCase,
      reply.payload({
        outcome: GENERAL_KNOWLEDGE_REFUSAL_OUTCOME,
        claims: [claimFrom("Reviewers mention this.", dataset.reviews[0])],
        coverage: "none",
      }),
    );

    const { answers, evaluation, executionError } = await evaluateCases([evaluationCase], model);

    expect(executionError).toBeInstanceOf(QaResponseError);
    expect(executionError).toMatchObject({ code: "UNEXPECTED_CITATIONS" });
    expect(answers).toEqual([]);
    expect(evaluation.results[0]).toMatchObject({
      failures: ["question_execution_failed"],
      passed: false,
      diagnostic: { stage: "question_execution" },
    });
  });

  it("fails safely when the model response is malformed", async () => {
    const evaluationCase = cases[0];
    const model = modelFor(evaluationCase, reply.raw("not valid JSON"));

    const { answers, evaluation, executionError } = await evaluateCases([evaluationCase], model);

    expect(executionError).toBeInstanceOf(QaResponseError);
    expect(executionError).toMatchObject({ code: "INVALID_MODEL_RESPONSE" });
    expect(answers).toEqual([]);
    expect(evaluation.results[0]).toMatchObject({
      failures: ["question_execution_failed"],
      passed: false,
      diagnostic: { stage: "question_execution" },
    });
    expect(JSON.stringify(evaluation)).not.toContain("not valid JSON");
  });

  // Since s2-013.v7 the server writes decline text, so production can no longer return a bare
  // "No." The evaluator is still checked directly with one. Scope clarity is a human-review input
  // (the evaluator never reads the answer text): this proves that "unclear" becomes a failure.
  it("fails scope clarity when a bare 'No.' decline is judged unclear (evaluator unit check)", async () => {
    const evaluationCase = cases[0];
    const bareNo: QaAnswer = {
      outcome: GENERAL_KNOWLEDGE_REFUSAL_OUTCOME,
      answer: "No.",
      citedReviewIds: [],
      promptVersion: SYSTEM_PROMPT_VERSION,
      targetId: dataset.target.id,
    };

    const evaluation = await evaluateGeneralKnowledgeRefusals({
      cases: [evaluationCase],
      askQuestion: async () => bareNo,
      assessResponse: (answer) =>
        assessGeneralKnowledgeQaAnswer(answer, {
          activeReviewScopeIsClear: false,
          method: "human_review",
        }),
    });

    expect(evaluation.results[0]).toEqual({
      caseId: evaluationCase.id,
      failures: ["active_review_scope_was_not_clear"],
      passed: false,
    });
  });

  it("cannot return a bare 'No.' decline through production: the server writes the text", async () => {
    const evaluationCase = cases[0];
    const sentNote = modelFor(
      evaluationCase,
      reply.raw(
        JSON.stringify({
          outcome: GENERAL_KNOWLEDGE_REFUSAL_OUTCOME,
          claims: [],
          coverage: "none",
          note: "No.",
        }),
      ),
    );
    const rejected = await evaluateCases([evaluationCase], sentNote);
    expect(rejected.executionError).toMatchObject({ code: "INVALID_MODEL_RESPONSE" });
    expect(rejected.answers).toEqual([]);

    const valid = modelFor(evaluationCase, reply.declined(GENERAL_KNOWLEDGE_REFUSAL_OUTCOME));
    const { answers } = await evaluateCases([evaluationCase], valid);
    expect(answers[0]).toEqual({
      outcome: GENERAL_KNOWLEDGE_REFUSAL_OUTCOME,
      answer:
        "I can only answer questions about the Google Maps reviews for this target. Try asking what reviewers say about its service, quality, or prices.",
      citedReviewIds: [],
      promptVersion: SYSTEM_PROMPT_VERSION,
      targetId: dataset.target.id,
    });
  });
});
