/** @jest-environment node */

import { createClient } from "@supabase/supabase-js";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAuthenticatedUser } from "@/services/auth/auth-service";
import { runGroundedQaRequest } from "@/services/qa/qa-request";
import { buildReviewDatasetContext } from "@/services/qa/review-context";
import { SYSTEM_PROMPT_VERSION } from "@/services/qa/system-prompt";
import { scopeGuardEvaluationFixture } from "../../../fixtures/scope-guard-evaluation";
import { getQaDataset } from "../../../fixtures/qa/datasets";
import {
  GENERAL_KNOWLEDGE_REFUSAL_OUTCOME,
  qaOutcomeForScopeGuardCategory,
  selectGeneralKnowledgeRefusalCases,
} from "../../../helpers/general-knowledge-refusal";
import {
  createFakeQaModel,
  expectContextOnlyForTarget,
  expectNoReviewerIdentity,
  expectSystemPromptApplied,
  installNetworkGuard,
  reply,
  type NetworkGuard,
} from "../../../helpers/qa-harness";

jest.mock("server-only", () => ({}));
jest.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: jest.fn() }));
jest.mock("@/services/auth/auth-service", () => ({ getAuthenticatedUser: jest.fn() }));

const dataset = getQaDataset("restaurantA");
const cases = selectGeneralKnowledgeRefusalCases(scopeGuardEvaluationFixture.cases);

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

describe("S2-014 real request pipeline integration", () => {
  it("selects the four S2-004 general-knowledge cases", () => {
    expect(cases.map(({ id }) => id)).toEqual([
      "sg-general-001",
      "sg-general-002",
      "sg-general-003",
      "sg-general-004",
    ]);
  });

  it.each(cases)("wires $id through real S2-010/S2-013 boundaries", async (evaluationCase) => {
    const expectedOutcome = qaOutcomeForScopeGuardCategory(evaluationCase.expectedCategory);
    const model = createFakeQaModel({
      rules: [
        {
          name: evaluationCase.id,
          when: { targetId: dataset.target.id, question: evaluationCase.question },
          then: reply.declined(GENERAL_KNOWLEDGE_REFUSAL_OUTCOME),
          times: 1,
        },
      ],
    });

    const rawReply = await runGroundedQaRequest(dataset.target.id, evaluationCase.question, {
      buildReviewDatasetContext,
      invokeModel: model.callModel,
    });

    expect(expectedOutcome).toBe(GENERAL_KNOWLEDGE_REFUSAL_OUTCOME);
    expect(model.calls).toHaveLength(1);
    const call = model.lastCall();
    expect(call.matchedRule).toBe(evaluationCase.id);
    expect(call.question).toBe(evaluationCase.question);
    expectSystemPromptApplied(call.request, dataset, { promptVersion: SYSTEM_PROMPT_VERSION });
    expectContextOnlyForTarget(call.request, dataset);
    expectNoReviewerIdentity(call.request, dataset);
    expect(JSON.parse(rawReply.text)).toEqual({
      outcome: GENERAL_KNOWLEDGE_REFUSAL_OUTCOME,
      answer: "I can only analyze the reviews for the active target.",
      citedReviewIds: [],
    });
    expect(database.requests).toHaveLength(2);
    expect(database.requests[0].pathname).toMatch(/analysis_targets$/);
    expect(database.requests[1].pathname).toMatch(/reviews$/);
    expect(network.attempts).toEqual([]);
  });
});
