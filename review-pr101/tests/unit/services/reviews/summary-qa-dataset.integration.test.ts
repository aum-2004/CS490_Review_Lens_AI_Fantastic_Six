/** @jest-environment node */
jest.mock("server-only", () => ({}));
jest.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: jest.fn() }));
jest.mock("next/server", () => ({
  ...jest.requireActual("next/server"),
  connection: jest.fn(async () => {}),
}));

import { NextRequest } from "next/server";

import { GET as getSummaryRoute } from "@/app/api/analysis-targets/[targetId]/review-summary/route";
import { reconcileIngestion } from "@/services/ingestion/ingestion-lifecycle";

import { getQaDataset, QA_MISSING_TARGET_ID, QA_USERS } from "../../../fixtures/qa/datasets";
import {
  expectContextOnlyForTarget,
  expectErrorShape,
  parseEvidenceRows,
  QA_PIPELINE_ERRORS,
  reply,
  setupQaTestHarness,
  type QaAskResult,
  type QaModelRequest,
  type QaPipelineErrorKey,
} from "../../../helpers/qa-harness";
import { installSummaryQaBridge, type SummaryQaBridge } from "../../../helpers/summary-qa-bridge";

/**
 * S2-002 (#53): cross-boundary coverage between the S2-006 review summary and the S2-010/S2-011
 * Q&A pipeline. Both paths run their REAL production code (summary route, ownership guard,
 * summary service, review store; Q&A context builder, answerQuestion, prompt, reply validation)
 * over ONE set of persisted rows in the S2-003 fake Supabase. Only infrastructure is faked.
 *
 * Expected values are hand-computed from tests/fixtures/qa/datasets.ts, never read back from the
 * summary bridge (see tests/helpers/summary-qa-bridge.ts and tests/db/review-summary.test.sql).
 * Assertions check behavior (counts, IDs, outcomes, error codes), never answer wording.
 */

const { userA } = QA_USERS;
const mixedRatings = getQaDataset("mixedRatings");
const restaurantA = getQaDataset("restaurantA");
const targetA = getQaDataset("targetA");
const targetB = getQaDataset("targetB");
const userBPrivate = getQaDataset("userBPrivate");
const emptyTarget = getQaDataset("emptyTarget");

// Hand-computed from the fixture definitions.
const MIXED_RATINGS_IDS = [1, 2, 3, 4, 5].map((n) => `21000000-0000-4000-8000-00000000000${n}`);
const TARGET_A_IDS = [1, 2, 3].map((n) => `2a000000-0000-4000-8000-00000000000${n}`);
const TARGET_B_IDS = [1, 2].map((n) => `2b000000-0000-4000-8000-00000000000${n}`);
const TARGET_A_MARKER = "QA_TARGET_A_BATTERY_MARKER";
const TARGET_B_MARKER = "QA_TARGET_B_SERVICE_MARKER";

// Every question is answered by citing the first supplied review; wording is never asserted.
const qa = setupQaTestHarness({
  script: [
    {
      name: "cite-first-supplied-review",
      when: {},
      then: reply.dynamic((request) => reply.answered([request.reviewIds[0]])),
    },
  ],
});

let bridge: SummaryQaBridge;
beforeEach(() => {
  bridge = installSummaryQaBridge(qa().supabase);
  jest.spyOn(console, "error").mockImplementation(() => {});
  jest.spyOn(console, "info").mockImplementation(() => {});
});
afterEach(() => {
  jest.restoreAllMocks();
});

interface SummaryBody {
  success: boolean;
  data?: {
    targetId: string;
    reviewCount: number;
    averageRating: number | null;
    ingestionStatus: string | null;
    skippedCount: number | null;
  };
  error?: { code: string; message: string };
}

async function getSummary(targetId: string) {
  const response = await getSummaryRoute(
    new NextRequest(`http://reviewlens.test/api/analysis-targets/${targetId}/review-summary`),
    { params: Promise.resolve({ targetId }) },
  );
  return { status: response.status, body: (await response.json()) as SummaryBody };
}

function onlyRequest(result: QaAskResult): QaModelRequest {
  expect(result.calls).toHaveLength(1);
  if (!result.ok) throw result.error;
  return result.calls[0].request;
}

function expectRefused(result: QaAskResult, error: QaPipelineErrorKey) {
  expect(result.ok).toBe(false);
  if (!result.ok) expectErrorShape(result.error, QA_PIPELINE_ERRORS[error]);
  expect(result.calls).toHaveLength(0);
}

const reviewReads = () => qa().supabase.requests.filter((r) => r.resource === "reviews");
const restReads = () => qa().supabase.requests.filter((r) => r.kind === "rest");

function clearLogs() {
  qa().supabase.clearRequests();
  bridge.clearRequests();
}

describe("S2-BR-007: summary and Q&A context come from the same persisted dataset", () => {
  it.each([
    // [dataset, hand-computed count, hand-computed average, ratings in persisted order]
    ["mixedRatings", mixedRatings, 5, 3, [1, 2, 3, 4, 5]],
    ["restaurantA", restaurantA, 4, 4, [5, 4, 2, 5]],
    ["targetA", targetA, 3, 11 / 3, [5, 2, 4]],
    ["targetB", targetB, 2, 3, [5, 1]],
  ] as const)(
    "%s: summary count and average equal the Q&A evidence set",
    async (_key, dataset, count, average, ratings) => {
      const summary = await getSummary(dataset.target.id);
      expect(summary.status).toBe(200);
      expect(summary.body.data).toMatchObject({
        targetId: dataset.target.id,
        reviewCount: count,
        ingestionStatus: null,
        skippedCount: null,
      });
      expect(summary.body.data!.averageRating).toBeCloseTo(average, 10);

      const request = onlyRequest(await qa().ask(dataset.target.id, "What do reviewers say?"));
      expect(request.targetId).toBe(dataset.target.id);
      const rows = parseEvidenceRows(request);
      expect(rows).toHaveLength(count);
      expect(request.reviewIds).toHaveLength(count);
      expect(rows.map((row) => row.rating)).toEqual(ratings);
      expectContextOnlyForTarget(request, dataset);
    },
  );

  it("mixedRatings: Q&A evidence carries exactly the five persisted review IDs", async () => {
    const request = onlyRequest(await qa().ask(mixedRatings.target.id, "How is the coffee?"));
    expect(request.reviewIds).toEqual(MIXED_RATINGS_IDS);
    expect(parseEvidenceRows(request).map((row) => row.id)).toEqual(MIXED_RATINGS_IDS);
  });

  it("S2-BR-002: the summary is a database aggregate, never a model call or a review-text read", async () => {
    clearLogs();
    const summary = await getSummary(mixedRatings.target.id);
    expect(summary.status).toBe(200);
    expect(qa().model.calls).toHaveLength(0);
    expect(reviewReads()).toHaveLength(0);
    expect(bridge.requests.map((r) => r.resource)).toEqual([
      "rpc:get_review_summary",
      "latest_ingestion_attempts",
    ]);
    expect(JSON.stringify(summary.body)).not.toContain("QA_MIXED_RATINGS_MARKER");
    expect(JSON.stringify(summary.body)).not.toContain("QA_REVIEWER_NAME_");
  });
});

describe("S2-BR-003/004/006: skipped and rejected records are never counted as ingested", () => {
  const PLACE_ID = "ChIJs2002SyntheticPlace";
  const identity = { placeId: PLACE_ID, businessName: "Empty Target Diner" };
  const VALID = [
    { text: "S2_002_VALID_ONE great pancakes", rating: 4 },
    { text: "S2_002_VALID_TWO quick service", rating: 5 },
    { text: "S2_002_VALID_THREE cold coffee", rating: 3 },
  ];
  const REJECTED_MARKERS = [
    "S2_002_REJECTED_NO_RATING",
    "S2_002_REJECTED_BAD_RATING",
    "S2_002_REJECTED_BLANK_TEXT",
  ];
  const REJECTED = [
    { text: `${REJECTED_MARKERS[0]} no rating`, rating: null },
    { text: `${REJECTED_MARKERS[1]} out of range`, rating: 7 },
    { text: "   ", rating: 4, reviewerName: REJECTED_MARKERS[2] },
  ];

  function ingest(records: Record<string, unknown>[], providerSkipped: number) {
    bridge.addAttempt({ analysis_target_id: emptyTarget.target.id, owner_id: userA.id });
    return reconcileIngestion(bridge.client(), userA.id, emptyTarget.target.id, {
      writer: bridge.writer,
      storageApproved: true,
      recoveryUrl: () => "http://reviewlens.test/api/ingestion/recover",
      extract: async () =>
        ({
          status: "completed",
          placeId: PLACE_ID,
          businessName: identity.businessName,
          identity,
          reviews: records,
          skippedCount: providerSkipped,
        }) as never,
    });
  }

  it("a partly rejected batch: summary and Q&A both see only the 3 saved reviews; skippedCount reports 4", async () => {
    // 3 valid + 3 rejected by normalization + 1 skipped by the provider = 3 saved, 4 skipped.
    const ingestion = await ingest(
      [VALID[0], REJECTED[0], VALID[1], REJECTED[1], VALID[2], REJECTED[2]],
      1,
    );
    expect(ingestion).toMatchObject({ state: "succeeded", savedCount: 3, skippedCount: 4 });

    const summary = await getSummary(emptyTarget.target.id);
    expect(summary.status).toBe(200);
    expect(summary.body.data).toEqual({
      targetId: emptyTarget.target.id,
      reviewCount: 3,
      averageRating: 4, // (4 + 5 + 3) / 3
      ingestionStatus: "succeeded",
      skippedCount: 4,
    });

    const request = onlyRequest(await qa().ask(emptyTarget.target.id, "How is breakfast?"));
    const rows = parseEvidenceRows(request);
    expect(rows).toHaveLength(3);
    expect(rows.map((row) => row.text)).toEqual(VALID.map((record) => record.text));
    expect(rows.map((row) => row.rating)).toEqual([4, 5, 3]);
    const sent = JSON.stringify(request);
    for (const marker of REJECTED_MARKERS) expect(sent).not.toContain(marker);
  });

  it("S2-BR-025: an all-rejected batch fails ingestion; summary shows no normal values and Q&A never calls the model", async () => {
    const ingestion = await ingest(REJECTED, 0);
    expect(ingestion).toMatchObject({
      state: "failed",
      savedCount: 0,
      skippedCount: 3,
      errorCode: "NO_REVIEWS",
    });

    const summary = await getSummary(emptyTarget.target.id);
    expect(summary.body.data).toEqual({
      targetId: emptyTarget.target.id,
      reviewCount: 0,
      averageRating: null,
      ingestionStatus: "failed",
      skippedCount: 3,
    });
    expectRefused(await qa().ask(emptyTarget.target.id, "How is breakfast?"), "noReviewData");
    expect(
      qa().supabase.tables.reviews.some((r) => r.analysis_target_id === emptyTarget.target.id),
    ).toBe(false);
  });
});

describe("S2-BR-022/023/024: the full signed-in journey switches both summary and Q&A", () => {
  beforeEach(() => {
    // Distinct skipped counts make leaked ingestion details visible after a switch.
    bridge.addAttempt({
      analysis_target_id: targetA.target.id,
      owner_id: userA.id,
      status: "succeeded",
      saved_count: 3,
      skipped_count: 1,
    });
    bridge.addAttempt({
      analysis_target_id: targetB.target.id,
      owner_id: userA.id,
      status: "succeeded",
      saved_count: 2,
      skipped_count: 0,
    });
  });

  const expected = {
    A: {
      dataset: targetA,
      ids: TARGET_A_IDS,
      count: 3,
      average: 11 / 3,
      skipped: 1,
      marker: TARGET_A_MARKER,
      otherMarker: TARGET_B_MARKER,
      other: targetB,
    },
    B: {
      dataset: targetB,
      ids: TARGET_B_IDS,
      count: 2,
      average: 3,
      skipped: 0,
      marker: TARGET_B_MARKER,
      otherMarker: TARGET_A_MARKER,
      other: targetA,
    },
  } as const;

  it("A -> B -> A: each step returns only the active target's summary and Q&A dataset, one model call per question", async () => {
    for (const [step, key] of (["A", "B", "A"] as const).entries()) {
      const active = expected[key];
      const callsBefore = qa().model.calls.length;

      const summary = await getSummary(active.dataset.target.id);
      expect(summary.status).toBe(200);
      expect(summary.body.data).toMatchObject({
        targetId: active.dataset.target.id,
        reviewCount: active.count,
        ingestionStatus: "succeeded",
        skippedCount: active.skipped,
      });
      expect(summary.body.data!.averageRating).toBeCloseTo(active.average, 10);
      expect(JSON.stringify(summary.body)).not.toContain(active.other.target.id);

      const result = await qa().ask(active.dataset.target.id, `Step ${step + 1}: what stands out?`);
      const request = onlyRequest(result);
      expect(qa().model.calls).toHaveLength(callsBefore + 1);
      expect(result.ok && result.answer.targetId).toBe(active.dataset.target.id);
      expect(request.reviewIds).toEqual(active.ids);
      expect(request.reviewIds).toHaveLength(summary.body.data!.reviewCount);

      const sent = JSON.stringify(request);
      expect(sent).toContain(active.marker);
      expect(sent).not.toContain(active.otherMarker);
      expect(sent).not.toContain(active.other.target.id);
      for (const id of active.other.reviews.map((review) => review.id)) {
        expect(sent).not.toContain(id);
      }
    }
    // No request across the whole journey ever mixed the two targets.
    for (const call of qa().model.calls) {
      const sent = JSON.stringify(call.request);
      expect(sent.includes(TARGET_A_MARKER) && sent.includes(TARGET_B_MARKER)).toBe(false);
    }
    expect(qa().model.calls).toHaveLength(3);
  });
});

describe("S2-BR-022/026: another user's target is denied on both paths before any review read", () => {
  it("summary and Q&A deny User B's target exactly like a missing one, with no reads and no model call", async () => {
    bridge.addAttempt({
      analysis_target_id: userBPrivate.target.id,
      owner_id: QA_USERS.userB.id,
      status: "succeeded",
      saved_count: 2,
    });
    const bodies: SummaryBody[] = [];
    for (const targetId of [userBPrivate.target.id, QA_MISSING_TARGET_ID]) {
      clearLogs();
      const summary = await getSummary(targetId);
      expect(summary.status).toBe(404);
      expect(summary.body.error?.code).toBe("TARGET_NOT_FOUND");
      bodies.push(summary.body);

      expectRefused(await qa().ask(targetId, "What about the sourdough?"), "targetNotFound");
      expect(reviewReads()).toHaveLength(0);
      expect(bridge.requests).toHaveLength(0); // no aggregate and no ingestion-attempt read
      expect(qa().supabase.requests.every((r) => r.actorId === userA.id)).toBe(true);
    }
    expect(bodies[0]).toEqual(bodies[1]);
    expect(JSON.stringify(bodies)).not.toContain("QA_USER_B_PRIVATE_MARKER");
    expect(qa().model.calls).toHaveLength(0);
  });
});

describe("S2-BR-025: a target with no ingested reviews gives no normal answer", () => {
  it("never-ingested empty target: summary reports zero with no average, Q&A refuses without the model", async () => {
    const summary = await getSummary(emptyTarget.target.id);
    expect(summary.body.data).toEqual({
      targetId: emptyTarget.target.id,
      reviewCount: 0,
      averageRating: null,
      ingestionStatus: null,
      skippedCount: null,
    });
    expectRefused(await qa().ask(emptyTarget.target.id, "Is it good?"), "noReviewData");
  });

  it("provider-failed ingestion target: summary reports the failure with zero reviews, Q&A refuses", async () => {
    bridge.addAttempt({
      analysis_target_id: emptyTarget.target.id,
      owner_id: userA.id,
      status: "failed",
      error_code: "PROVIDER_REJECTED",
    });
    const summary = await getSummary(emptyTarget.target.id);
    expect(summary.body.data).toMatchObject({
      reviewCount: 0,
      averageRating: null,
      ingestionStatus: "failed",
    });
    expectRefused(await qa().ask(emptyTarget.target.id, "Is it good?"), "noReviewData");
  });
});

describe("negative and edge cases", () => {
  it("signed out: summary is 401 and Q&A is AUTH_REQUIRED, with no table or RPC reads", async () => {
    qa().setActor(null);
    clearLogs();
    expect((await getSummary(mixedRatings.target.id)).status).toBe(401);
    expectRefused(await qa().ask(mixedRatings.target.id, "Anything?"), "authRequired");
    expect(restReads()).toHaveLength(0);
    expect(bridge.requests).toHaveLength(0);
  });

  it("over the Q&A context budget (current behavior; owners may change the refusal rule): summary reports the true count, Q&A refuses rather than answering from a subset", async () => {
    // 101 persisted reviews, all rated 4: the summary must say 101 / 4.
    for (let n = 1; n <= 101; n += 1) {
      qa().supabase.tables.reviews.push({
        id: `5b000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
        analysis_target_id: emptyTarget.target.id,
        review_text: `S2_002_BULK_REVIEW_${n}`,
        rating: 4,
        source_review_id: null,
        reviewer_name: null,
        review_date: null,
        review_url: null,
        source_metadata: null,
        created_at: `2026-11-14T10:00:00.${String(n).padStart(3, "0")}Z`,
      });
    }
    const summary = await getSummary(emptyTarget.target.id);
    expect(summary.body.data).toMatchObject({ reviewCount: 101, averageRating: 4 });

    const result = await qa().ask(emptyTarget.target.id, "Summarize the reviews.");
    expectRefused(result, "contextTooLarge");
    expect(result.ok).toBe(false);
  });

  it("a failed summary aggregate is a safe 500, never zero values, and does not affect Q&A for the target", async () => {
    bridge.failSummary(500);
    const summary = await getSummary(mixedRatings.target.id);
    expect(summary.status).toBe(500);
    expect(summary.body).toEqual({
      success: false,
      error: { code: "REVIEW_SUMMARY_LOAD_FAILED", message: expect.any(String) },
    });
    expect(JSON.stringify(summary.body)).not.toMatch(/DIAGNOSTIC|reviewCount/);

    const request = onlyRequest(await qa().ask(mixedRatings.target.id, "How is the coffee?"));
    expect(request.reviewIds).toEqual(MIXED_RATINGS_IDS);
  });
});
