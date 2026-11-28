/** @jest-environment node */

// S3-006: the questions route saves each shown exchange to the analysis it belongs to, never hides
// an answer when saving fails, saves nothing for failed requests, and lists only the owner's
// history for the requested analysis.
import { NextRequest, NextResponse } from "next/server";
import { GET, POST } from "@/app/api/analysis-targets/[targetId]/questions/route";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireApiUser } from "@/services/auth/access-control";
import {
  getOwnedTargetOrThrow,
  TargetNotFoundError,
} from "@/services/analysis-targets/target-ownership";
import { buildReviewDatasetContext } from "@/services/qa/review-context";
import { createOpenAiQaModel, QaModelError } from "@/services/qa/openai-qa-client";
import { reserveQuestionQuota, QuestionQuotaError } from "@/services/qa/question-quota";
import { listQaHistory, QaHistoryError, recordQaExchange } from "@/services/qa/qa-history";
import { SYSTEM_PROMPT_VERSION } from "@/services/qa/system-prompt";

import { claimReply, evidenceFrom } from "../../../../../../helpers/qa-harness/grounded-reply";

jest.mock("server-only", () => ({}));
jest.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: jest.fn() }));
jest.mock("@/services/auth/access-control", () => ({ requireApiUser: jest.fn() }));
jest.mock("@/services/analysis-targets/target-ownership", () => ({
  ...jest.requireActual("@/services/analysis-targets/target-ownership"),
  getOwnedTargetOrThrow: jest.fn(),
}));
jest.mock("@/services/qa/review-context", () => ({
  ...jest.requireActual("@/services/qa/review-context"),
  buildReviewDatasetContext: jest.fn(),
}));
jest.mock("@/services/qa/openai-qa-client", () => ({
  ...jest.requireActual("@/services/qa/openai-qa-client"),
  createOpenAiQaModel: jest.fn(),
  readOpenAiQaConfig: jest.fn(),
}));
jest.mock("@/services/qa/question-quota", () => ({
  ...jest.requireActual("@/services/qa/question-quota"),
  reserveQuestionQuota: jest.fn(),
}));
jest.mock("@/services/qa/qa-history", () => ({
  ...jest.requireActual("@/services/qa/qa-history"),
  recordQaExchange: jest.fn(),
  listQaHistory: jest.fn(),
}));

const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";
const TARGET_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const TARGET_A2 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2";
const A1 = "a1a1a1a1-0000-4000-8000-000000000001";
const A2_REVIEW = "a2a2a2a2-0000-4000-8000-000000000002";
const EXCHANGE = "e0000000-0000-4000-8000-000000000001";
const SESSION_CLIENT = { session: true };

const owners: Record<string, string> = { [TARGET_A]: USER_A, [TARGET_A2]: USER_A };
const reviewsByTarget: Record<string, string> = { [TARGET_A]: A1, [TARGET_A2]: A2_REVIEW };

let currentUser: string | null = USER_A;
let reply: unknown;
const model = jest.fn();

function answeredFrom(targetId: string) {
  const id = reviewsByTarget[targetId];
  return claimReply.answered([
    { statement: "Bread is great.", evidence: [evidenceFrom({ id, text: "Great bread here" })] },
  ]);
}

function post(targetId = TARGET_A, question = "What do reviewers like?") {
  return POST(
    new NextRequest(`http://localhost/api/analysis-targets/${targetId}/questions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question }),
    }),
    { params: Promise.resolve({ targetId }) } as never,
  );
}

function get(targetId = TARGET_A) {
  return GET(new NextRequest(`http://localhost/api/analysis-targets/${targetId}/questions`), {
    params: Promise.resolve({ targetId }),
  } as never);
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, "error").mockImplementation(() => {});
  currentUser = USER_A;
  reply = answeredFrom(TARGET_A);
  jest
    .mocked(requireApiUser)
    .mockImplementation(async () =>
      currentUser
        ? { user: { id: currentUser, email: null } }
        : ({ response: NextResponse.json({}, { status: 401 }) } as never),
    );
  jest.mocked(createSupabaseServerClient).mockResolvedValue(SESSION_CLIENT as never);
  jest.mocked(getOwnedTargetOrThrow).mockImplementation(async (_client, targetId, userId) => {
    if (owners[targetId] !== userId) throw new TargetNotFoundError();
    return {} as never;
  });
  jest.mocked(buildReviewDatasetContext).mockImplementation(
    async (targetId) =>
      ({
        target: { id: String(targetId), name: "Bakery", platform: "google_maps" },
        reviews: [
          {
            id: reviewsByTarget[String(targetId)],
            analysisTargetId: String(targetId),
            text: "Great bread here",
            rating: 5,
            reviewDate: null,
          },
        ],
      }) as never,
  );
  model.mockImplementation(async () => ({ text: JSON.stringify(reply) }));
  jest.mocked(createOpenAiQaModel).mockReturnValue(model);
  jest.mocked(reserveQuestionQuota).mockResolvedValue(undefined);
  jest
    .mocked(recordQaExchange)
    .mockResolvedValue({ id: EXCHANGE, createdAt: "2026-11-26T00:00:00Z" });
  jest.mocked(listQaHistory).mockResolvedValue([]);
});

afterEach(() => jest.restoreAllMocks());

describe("POST saves the exchange", () => {
  it("stores the question, shown answer and citations on the active analysis", async () => {
    const response = await post();
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(recordQaExchange).toHaveBeenCalledTimes(1);
    expect(recordQaExchange).toHaveBeenCalledWith(SESSION_CLIENT, {
      targetId: TARGET_A,
      question: "What do reviewers like?",
      outcome: "answered",
      answer: body.data.answer,
      citedReviewIds: [A1],
      promptVersion: SYSTEM_PROMPT_VERSION,
    });
    expect(body.data.history).toEqual({
      saved: true,
      id: EXCHANGE,
      createdAt: "2026-11-26T00:00:00Z",
    });
  });

  it("keeps each analysis's exchange on that analysis", async () => {
    reply = answeredFrom(TARGET_A2);
    await post(TARGET_A2, "Second analysis question");
    expect(jest.mocked(recordQaExchange).mock.calls[0][1]).toMatchObject({
      targetId: TARGET_A2,
      question: "Second analysis question",
      citedReviewIds: [A2_REVIEW],
    });
  });

  it.each([
    ["insufficient_evidence", "insufficient_evidence"],
    ["declined_general_knowledge", "out_of_scope"],
    ["declined_other_entity", "out_of_scope"],
  ] as const)("stores a %s response as %s without citations", async (outcome, stored) => {
    reply = { outcome, claims: [], coverage: "none" };
    const response = await post();
    expect(response.status).toBe(200);
    expect(jest.mocked(recordQaExchange).mock.calls[0][1]).toMatchObject({
      outcome: stored,
      citedReviewIds: [],
    });
  });

  it.each([
    [
      "an unavailable database",
      new QaHistoryError("QA_HISTORY_UNAVAILABLE"),
      "QA_HISTORY_UNAVAILABLE",
    ],
    ["a full history", new QaHistoryError("QA_HISTORY_FULL"), "QA_HISTORY_FULL"],
    ["an unexpected error", new Error("socket closed"), "QA_HISTORY_UNAVAILABLE"],
  ])(
    "still returns the answer after %s and says it was not saved",
    async (_case, error, reason) => {
      jest.mocked(recordQaExchange).mockRejectedValue(error);
      const response = await post();
      const body = await response.json();
      expect(response.status).toBe(200);
      expect(body.data.outcome).toBe("answered");
      expect(body.data.answer).toContain("Bread is great.");
      expect(body.data.history).toEqual({ saved: false, reason });
      expect(JSON.stringify(body)).not.toContain("socket closed");
    },
  );

  it.each([
    ["a foreign analysis", () => (currentUser = USER_B), 404],
    ["no signed-in user", () => (currentUser = null), 401],
    [
      "a quota denial",
      () =>
        jest
          .mocked(reserveQuestionQuota)
          .mockRejectedValue(new QuestionQuotaError("QA_DAILY_LIMIT")),
      429,
    ],
    ["a model failure", () => model.mockRejectedValue(new QaModelError("MODEL_TIMEOUT")), 503],
    [
      "an ungrounded reply",
      () => (reply = { outcome: "answered", claims: [], coverage: "complete" }),
      503,
    ],
  ])("saves nothing for %s", async (_case, arrange, status) => {
    arrange();
    const response = await post();
    expect(response.status).toBe(status);
    expect(recordQaExchange).not.toHaveBeenCalled();
  });
});

describe("GET lists the history", () => {
  const exchanges = [
    {
      id: EXCHANGE,
      question: "What do reviewers like?",
      outcome: "answered" as const,
      answer: "Bread is great.",
      citedReviewIds: [A1],
      createdAt: "2026-11-26T00:00:00Z",
    },
    {
      id: "e0000000-0000-4000-8000-000000000002",
      question: "Is there parking?",
      outcome: "insufficient_evidence" as const,
      answer: "These reviews don't contain enough information to answer that question.",
      citedReviewIds: [],
      createdAt: "2026-11-26T00:01:00Z",
    },
  ];

  it("returns the owner's history for the requested analysis in stored order", async () => {
    jest.mocked(listQaHistory).mockResolvedValue(exchanges);
    const response = await get();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await response.json()).toEqual({
      success: true,
      data: { targetId: TARGET_A, exchanges },
    });
    expect(getOwnedTargetOrThrow).toHaveBeenCalledWith(SESSION_CLIENT, TARGET_A, USER_A);
    expect(listQaHistory).toHaveBeenCalledWith(SESSION_CLIENT, TARGET_A);
  });

  it("returns an empty list when the analysis has no history", async () => {
    const response = await get(TARGET_A2);
    expect(await response.json()).toEqual({
      success: true,
      data: { targetId: TARGET_A2, exchanges: [] },
    });
  });

  it("denies another user's analysis with the standard not-found response", async () => {
    currentUser = USER_B;
    const response = await get();
    expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe("TARGET_NOT_FOUND");
    expect(listQaHistory).not.toHaveBeenCalled();
  });

  it("requires a signed-in user", async () => {
    currentUser = null;
    const response = await get();
    expect(response.status).toBe(401);
    expect(listQaHistory).not.toHaveBeenCalled();
  });

  it("reports an unavailable history without details", async () => {
    jest.mocked(listQaHistory).mockRejectedValue(new QaHistoryError("QA_HISTORY_UNAVAILABLE"));
    const response = await get();
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe("QA_HISTORY_UNAVAILABLE");
  });

  it("maps unexpected errors to a generic failure", async () => {
    jest.mocked(listQaHistory).mockRejectedValue(new Error("connection reset by 10.0.0.1"));
    const response = await get();
    const body = await response.json();
    expect(response.status).toBe(500);
    expect(body.error.code).toBe("QA_HISTORY_FAILED");
    expect(JSON.stringify(body)).not.toContain("10.0.0.1");
  });
});
