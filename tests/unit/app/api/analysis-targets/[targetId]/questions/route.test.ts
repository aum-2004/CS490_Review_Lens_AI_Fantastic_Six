/** @jest-environment node */

// Citation contract for the questions route. The real orchestration (answerQuestion →
// runGroundedQaRequest → parseQaModelReply) runs; only auth, the database client, the review
// context, the quota RPC and the model are replaced. No network or provider call is made.
import { NextRequest, NextResponse } from "next/server";
import { POST } from "@/app/api/analysis-targets/[targetId]/questions/route";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireApiUser } from "@/services/auth/access-control";
import {
  getOwnedTargetOrThrow,
  TargetNotFoundError,
} from "@/services/analysis-targets/target-ownership";
import { buildReviewDatasetContext } from "@/services/qa/review-context";
import { createOpenAiQaModel } from "@/services/qa/openai-qa-client";
import { reserveQuestionQuota, QuestionQuotaError } from "@/services/qa/question-quota";
import { MAX_CITED_REVIEWS } from "@/lib/qa/citations";

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

const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";
const TARGET_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const TARGET_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2";
const A1 = "a1a1a1a1-0000-4000-8000-000000000001";
const A2 = "a2a2a2a2-0000-4000-8000-000000000002";
const B1 = "b1b1b1b1-0000-4000-8000-000000000003";

const datasets: Record<string, { owner: string; reviewIds: string[] }> = {
  [TARGET_A]: { owner: USER_A, reviewIds: [A1, A2] },
  [TARGET_B]: { owner: USER_B, reviewIds: [B1] },
};

let currentUser = USER_A;
let reply: unknown;
let quotaUsed = 0;
const model = jest.fn();

function contextFor(targetId: string) {
  const dataset = datasets[targetId];
  return {
    target: { id: targetId, name: "Bakery", platform: "google_maps" as const },
    reviews: dataset.reviewIds.map((id, index) => ({
      id,
      analysisTargetId: targetId,
      text: `Review ${index + 1} text`,
      rating: 4,
      reviewDate: null,
    })),
  };
}

function post(targetId = TARGET_A) {
  return POST(
    new NextRequest(`http://localhost/api/analysis-targets/${targetId}/questions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: "What do reviewers like?" }),
    }),
    { params: Promise.resolve({ targetId }) } as never,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, "error").mockImplementation(() => {});
  currentUser = USER_A;
  quotaUsed = 0;
  reply = { outcome: "answered", answer: `Bread is great [${A1}].`, citedReviewIds: [A1] };
  jest
    .mocked(requireApiUser)
    .mockImplementation(async () => ({ user: { id: currentUser, email: null } }));
  jest.mocked(createSupabaseServerClient).mockResolvedValue({} as never);
  // Ownership is enforced per authenticated user, as in production.
  jest.mocked(getOwnedTargetOrThrow).mockImplementation(async (_client, targetId, userId) => {
    if (datasets[targetId]?.owner !== userId) throw new TargetNotFoundError();
    return {} as never;
  });
  jest
    .mocked(buildReviewDatasetContext)
    .mockImplementation(async (targetId) => contextFor(String(targetId)) as never);
  model.mockImplementation(async () => ({ text: JSON.stringify(reply) }));
  jest.mocked(createOpenAiQaModel).mockReturnValue(model);
  jest.mocked(reserveQuestionQuota).mockImplementation(async () => {
    if (quotaUsed >= 5) throw new QuestionQuotaError("QA_DAILY_LIMIT");
    quotaUsed += 1;
  });
});

afterEach(() => jest.restoreAllMocks());

it("returns the validated citations of an answer, deduplicated in first-appearance order", async () => {
  reply = { outcome: "answered", answer: "Great bread and coffee.", citedReviewIds: [A2, A1, A2] };
  const response = await post();
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    success: true,
    data: {
      targetId: TARGET_A,
      outcome: "answered",
      answer: "Great bread and coffee.",
      citedReviewIds: [A2, A1],
    },
  });
});

it.each([
  ["insufficient_evidence", "insufficient_evidence"],
  ["declined_general_knowledge", "out_of_scope"],
  ["declined_other_entity", "out_of_scope"],
  ["declined_other_platform", "out_of_scope"],
] as const)("returns no citations for the %s outcome", async (outcome, shown) => {
  reply = { outcome, answer: "I can't answer that from these reviews.", citedReviewIds: [] };
  const response = await post();
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.data).toMatchObject({ outcome: shown, citedReviewIds: [] });
});

it("fails closed when a refusal carries citations", async () => {
  reply = { outcome: "insufficient_evidence", answer: "Not enough.", citedReviewIds: [A1] };
  const response = await post();
  expect(response.status).toBe(503);
  const body = await response.json();
  expect(body).toMatchObject({ success: false, error: { code: "UNEXPECTED_CITATIONS" } });
  expect(body.data).toBeUndefined();
  expect(JSON.stringify(body)).not.toContain(A1);
});

it("fails closed when an answer cites another target's or another user's review", async () => {
  reply = { outcome: "answered", answer: `Leaked [${B1}].`, citedReviewIds: [A1, B1] };
  const response = await post(TARGET_A);
  expect(response.status).toBe(503);
  const body = JSON.stringify(await response.json());
  expect(body).toContain("UNGROUNDED_ANSWER");
  expect(body).not.toContain(B1);
  expect(body).not.toContain(A1);
});

it("never returns another user's target or citations", async () => {
  currentUser = USER_B;
  const response = await post(TARGET_A);
  expect(response.status).toBe(404);
  const body = JSON.stringify(await response.json());
  expect(body).not.toContain(A1);
  expect(body).not.toContain("citedReviewIds");
  expect(model).not.toHaveBeenCalled();
});

it("scopes citations to the requested target when switching targets", async () => {
  datasets[TARGET_B].owner = USER_A;
  try {
    reply = { outcome: "answered", answer: "A answer", citedReviewIds: [A1] };
    const first = await (await post(TARGET_A)).json();
    reply = { outcome: "answered", answer: "B answer", citedReviewIds: [B1] };
    const second = await (await post(TARGET_B)).json();
    expect(first.data).toMatchObject({ targetId: TARGET_A, citedReviewIds: [A1] });
    expect(second.data).toMatchObject({ targetId: TARGET_B, citedReviewIds: [B1] });
    // A's citation would be foreign evidence for B.
    reply = { outcome: "answered", answer: "Mixed", citedReviewIds: [A1] };
    expect((await post(TARGET_B)).status).toBe(503);
  } finally {
    datasets[TARGET_B].owner = USER_B;
  }
});

it.each([
  ["invalid JSON", "not json"],
  ["an unknown outcome", JSON.stringify({ outcome: "maybe", answer: "x", citedReviewIds: [] })],
  [
    "non-string citations",
    JSON.stringify({ outcome: "answered", answer: "x", citedReviewIds: [1] }),
  ],
  [
    "an answer without citations",
    JSON.stringify({ outcome: "answered", answer: "x", citedReviewIds: [] }),
  ],
])("returns an error without citations for %s", async (_label, text) => {
  model.mockResolvedValueOnce({ text });
  const response = await post();
  expect(response.status).toBe(503);
  const body = await response.json();
  expect(body.success).toBe(false);
  expect(body.data).toBeUndefined();
});

it("keeps the five-attempt quota and returns no citations once it is exceeded", async () => {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    expect((await post()).status).toBe(200);
  }
  const denied = await post();
  expect(denied.status).toBe(429);
  expect(denied.headers.get("Retry-After")).toBe("86400");
  const body = await denied.json();
  expect(body).toMatchObject({ success: false, error: { code: "QA_DAILY_LIMIT" } });
  expect(body.data).toBeUndefined();
  expect(model).toHaveBeenCalledTimes(5);
});

it("caps citations at the supported maximum", async () => {
  const many = Array.from(
    { length: MAX_CITED_REVIEWS + 5 },
    (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
  );
  datasets[TARGET_A].reviewIds = many;
  try {
    reply = { outcome: "answered", answer: "Many.", citedReviewIds: many };
    const body = await (await post()).json();
    expect(body.data.citedReviewIds).toEqual(many.slice(0, MAX_CITED_REVIEWS));
  } finally {
    datasets[TARGET_A].reviewIds = [A1, A2];
  }
});

it("returns 401 without citations when unauthenticated", async () => {
  jest.mocked(requireApiUser).mockResolvedValueOnce({
    response: NextResponse.json(
      { success: false, error: { code: "AUTH_REQUIRED" } },
      { status: 401 },
    ),
  });
  const response = await post();
  expect(response.status).toBe(401);
  expect(JSON.stringify(await response.json())).not.toContain("citedReviewIds");
});
