/** @jest-environment node */

import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAuthenticatedUser } from "@/services/auth/auth-service";
import { runGroundedQaRequest } from "@/services/qa/qa-request";
import { buildReviewDatasetContext } from "@/services/qa/review-context";
import { resolveDeclineOutcome, SYSTEM_PROMPT_VERSION } from "@/services/qa/system-prompt";
import { getQaDataset } from "../../../fixtures/qa/datasets";
import { scopeGuardEvaluationFixture } from "../../../fixtures/scope-guard-evaluation";
import {
  ENTITY_PLATFORM_DECLINE_OUTCOMES,
  selectEntityPlatformRefusalCases,
} from "../../../helpers/entity-platform-refusal";
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
const refusalCases = selectEntityPlatformRefusalCases(scopeGuardEvaluationFixture.cases);

function setupPersistedFixture() {
  const target = scopeGuardEvaluationFixture.activeTarget;
  const targetRows = [
    {
      id: target.id,
      owner_id: target.ownerId,
      name: target.name,
      platform: target.platform,
      source_url: target.sourceUrl,
      google_place_id: target.googlePlaceId,
      created_at: target.createdAt,
    },
  ];
  const reviewRows = scopeGuardEvaluationFixture.persistedReviews.map((review) => ({
    id: review.id,
    analysis_target_id: review.analysisTargetId,
    review_text: review.text,
    rating: review.rating,
    review_date: review.reviewDate,
    created_at: review.createdAt,
  }));
  const client = createClient("http://fixture.supabase", "dummy-publishable", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      fetch: async (input) => {
        const url = new URL(String(input));
        let selected: Record<string, unknown>[] = url.pathname.endsWith("/reviews")
          ? reviewRows
          : targetRows;
        for (const [key, value] of url.searchParams) {
          if (value.startsWith("eq.")) {
            selected = selected.filter((row) => row[key] === value.slice(3));
          }
        }
        const count = selected.length;
        const fields = url.searchParams.get("select")!.split(",");
        selected = selected.map((row) =>
          Object.fromEntries(fields.map((field) => [field, row[field]])),
        );
        return new Response(JSON.stringify(selected), {
          headers: {
            "Content-Range": selected.length ? `0-${selected.length - 1}/${count}` : `*/${count}`,
          },
        });
      },
    },
  });

  jest.mocked(createSupabaseServerClient).mockResolvedValue(client);
  jest.mocked(getAuthenticatedUser).mockResolvedValue(dataset.owner);
}

describe("S2-015 real S2-010/S2-013 request integration", () => {
  let network: NetworkGuard;

  beforeEach(() => {
    jest.resetAllMocks();
    setupPersistedFixture();
    network = installNetworkGuard();
  });

  afterEach(() => {
    try {
      network.assertNoAttempts();
    } finally {
      network.restore();
    }
  });

  it("sends all six unchanged S2-004 cases through authenticated context and prompt construction", async () => {
    const model = createFakeQaModel({
      rules: refusalCases.map((evaluationCase) => ({
        name: evaluationCase.id,
        when: { question: evaluationCase.question },
        then: reply.declined(ENTITY_PLATFORM_DECLINE_OUTCOMES[evaluationCase.expectedCategory]),
        times: 1,
      })),
    });

    for (const evaluationCase of refusalCases) {
      await runGroundedQaRequest(dataset.target.id, evaluationCase.question, {
        buildReviewDatasetContext,
        invokeModel: model.callModel,
      });
    }

    expect(model.calls).toHaveLength(6);
    expect(model.calls.map(({ question }) => question)).toEqual(
      refusalCases.map(({ question }) => question),
    );
    for (const [index, call] of model.calls.entries()) {
      expect(call.matchedRule).toBe(refusalCases[index].id);
      expect(call.outcome?.kind).toBe("reply");
      if (call.outcome?.kind !== "reply") throw new Error("Expected the scripted model reply.");
      expect(JSON.parse(call.outcome.reply.text)).toMatchObject({
        outcome: ENTITY_PLATFORM_DECLINE_OUTCOMES[refusalCases[index].expectedCategory],
        citedReviewIds: [],
      });
      expectSystemPromptApplied(call.request, dataset, {
        promptVersion: SYSTEM_PROMPT_VERSION,
      });
      expectContextOnlyForTarget(call.request, dataset);
      expectNoReviewerIdentity(call.request, dataset);
      expect(JSON.stringify(call.request)).not.toMatch(
        /sourceReviewId|reviewerName|reviewUrl|sourceMetadata|sourceUrl|evidenceJson/,
      );
    }
  });

  it("uses entity-first priority for a local mixed entity/platform boundary case", async () => {
    const question = "How does Restaurant A compare with Restaurant B based on Amazon reviews?";
    const expectedOutcome = resolveDeclineOutcome([
      "declined_other_platform",
      "declined_other_entity",
    ]);
    const model = createFakeQaModel({
      rules: [
        {
          name: "mixed-entity-platform",
          when: { question },
          then: reply.declined(expectedOutcome),
          times: 1,
        },
      ],
    });

    await runGroundedQaRequest(dataset.target.id, question, {
      buildReviewDatasetContext,
      invokeModel: model.callModel,
    });

    expect(expectedOutcome).toBe("declined_other_entity");
    expect(model.lastCall().question).toBe(question);
    expectSystemPromptApplied(model.lastCall().request, dataset, {
      promptVersion: SYSTEM_PROMPT_VERSION,
    });
    expectContextOnlyForTarget(model.lastCall().request, dataset);
  });
});
