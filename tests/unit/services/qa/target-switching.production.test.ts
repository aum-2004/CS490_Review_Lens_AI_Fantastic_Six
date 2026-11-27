/** @jest-environment node */
import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { GET as getSummary } from "@/app/api/analysis-targets/[targetId]/review-summary/route";
import { POST } from "@/app/api/analysis-targets/[targetId]/questions/route";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAuthenticatedUser } from "@/services/auth/auth-service";
import { buildReviewDatasetContext } from "@/services/qa/review-context";
import { createOpenAiQaModel } from "@/services/qa/openai-qa-client";

import { claimFrom, claimReply } from "../../../helpers/qa-harness/grounded-reply";
jest.mock("server-only", () => ({}));
jest.mock("next/server", () => ({
  ...jest.requireActual("next/server"),
  connection: jest.fn(async () => {}),
}));
jest.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: jest.fn() }));
jest.mock("@/services/auth/auth-service", () => ({ getAuthenticatedUser: jest.fn() }));
jest.mock("@/services/ingestion/ingestion-attempt-repository", () => ({
  ...jest.requireActual("@/services/ingestion/ingestion-attempt-repository"),
  getLatestAttempt: jest.fn(async () => null),
}));
jest.mock("@/services/qa/openai-qa-client", () => ({
  ...jest.requireActual("@/services/qa/openai-qa-client"),
  createOpenAiQaModel: jest.fn(),
}));
const USER = "11111111-1111-4111-8111-111111111111",
  OTHER = "22222222-2222-4222-8222-222222222222";
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
  B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
function setup() {
  const targets = [
    { id: A, owner_id: USER, name: "Alpha bakery" },
    { id: B, owner_id: USER, name: "Beta coffee shop" },
    { id: C, owner_id: OTHER, name: "OTHER_PRIVATE_ENTITY" },
  ].map((t) => ({
    ...t,
    platform: "google_maps",
    source_url: "https://www.google.com/maps/place/Test",
    google_place_id: null,
    created_at: "2026-11-12T12:00:00Z",
  }));
  const rows = [
    {
      id: "alpha-review",
      analysis_target_id: A,
      review_text: "ALPHA_PRIVATE_REVIEW_MARKER battery life",
      rating: 4,
    },
    {
      id: "beta-review",
      analysis_target_id: B,
      review_text: "BETA_SERVICE_MARKER customer service",
      rating: 5,
    },
    { id: "other-review", analysis_target_id: C, review_text: "OTHER_PRIVATE_MARKER", rating: 1 },
  ].map((r) => ({
    ...r,
    review_date: "2026-10-01T12:00:00Z",
    reviewer_name: "EXCLUDE_REVIEWER",
    source_metadata: { marker: "EXCLUDE_METADATA" },
    created_at: "2026-11-12T12:00:00Z",
  }));
  const reads: string[] = [];
  let failReviews = false;
  const db = createClient("http://fixture.supabase", "dummy-publishable", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      fetch: async (input, init) => {
        if (String(input).includes("/rpc/reserve_review_question")) return new Response("29");
        const url = new URL(String(input));
        if (url.pathname.endsWith("/rpc/get_review_summary")) {
          const targetId = JSON.parse(String(init?.body)).p_target_id;
          reads.push("summary:" + targetId);
          const selected = rows.filter((row) => row.analysis_target_id === targetId);
          return new Response(
            JSON.stringify([
              {
                review_count: selected.length,
                average_rating: selected.length
                  ? selected.reduce((sum, row) => sum + row.rating, 0) / selected.length
                  : null,
              },
            ]),
          );
        }
        reads.push(url.pathname);
        if (failReviews && url.pathname.endsWith("/reviews"))
          return new Response(JSON.stringify({ message: "PRIVATE_DB_DIAGNOSTIC" }), {
            status: 500,
          });
        let selected: Record<string, unknown>[] = url.pathname.endsWith("/reviews")
          ? rows
          : targets;
        for (const [key, value] of url.searchParams)
          if (value.startsWith("eq."))
            selected = selected.filter((row) => row[key] === value.slice(3));
        const count = selected.length;
        const fields = url.searchParams.get("select")!.split(",");
        selected = selected
          .slice(
            Number(url.searchParams.get("offset") ?? 0),
            Number(url.searchParams.get("offset") ?? 0) +
              Number(url.searchParams.get("limit") ?? Infinity),
          )
          .map((row) => Object.fromEntries(fields.map((field) => [field, row[field]])));
        return new Response(JSON.stringify(selected), {
          headers: {
            "Content-Range": selected.length ? `0-${selected.length - 1}/${count}` : `*/${count}`,
          },
        });
      },
    },
  });
  jest.mocked(createSupabaseServerClient).mockResolvedValue(db);
  jest.mocked(getAuthenticatedUser).mockResolvedValue({ id: USER, email: "PRIVATE_ACCOUNT_EMAIL" });
  const outgoing: Record<string, unknown>[] = [];
  const countRequests: Record<string, unknown>[] = [];
  let inputTokens = 1000;
  let failCount = false;
  const fetcher = jest.fn(async (_input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const payload = JSON.parse(String(init?.body));
    if (String(_input) === "https://api.openai.com/v1/responses/input_tokens") {
      countRequests.push(payload);
      return failCount
        ? new Response("PRIVATE_COUNT_DIAGNOSTIC", { status: 503 })
        : new Response(
            JSON.stringify({ object: "response.input_tokens", input_tokens: inputTokens }),
          );
    }
    if (String(_input) !== "https://api.openai.com/v1/responses") {
      throw new Error("Unexpected provider endpoint in deterministic fixture.");
    }
    outgoing.push(payload);
    const inputLines = String(payload.input).split("\n");
    const datasetHeader = inputLines.findIndex((line) => line.startsWith("REVIEW DATASET ("));
    const reviews = JSON.parse(inputLines[datasetHeader + 1]);
    return new Response(
      JSON.stringify({
        status: "completed",
        output: [
          {
            type: "message",
            content: [
              {
                type: "output_text",
                text: claimReply.text(
                  claimReply.answered([claimFrom(reviews[0].text, reviews[0])]),
                ),
              },
            ],
          },
        ],
      }),
    );
  });
  const deps = {
    buildReviewDatasetContext,
    callModel: jest
      .requireActual<typeof import("@/services/qa/openai-qa-client")>(
        "@/services/qa/openai-qa-client",
      )
      .createOpenAiQaModel({
        fetcher,
        env: {
          QA_ENABLED: "true",
          OPENAI_API_KEY: "synthetic-key-not-live",
          OPENAI_QA_MODEL: "synthetic-model",
        },
      }),
  };
  return {
    db,
    rows,
    reads,
    outgoing,
    countRequests,
    fetcher,
    deps,
    setInputTokens: (value: number) => {
      inputTokens = value;
    },
    failCount: () => {
      failCount = true;
    },
    failReviews: () => {
      failReviews = true;
    },
  };
}

const originalEnv = { ...process.env };
beforeEach(() => {
  process.env.QA_ENABLED = "true";
  process.env.OPENAI_API_KEY = "synthetic-key-not-live";
  process.env.OPENAI_QA_MODEL = "synthetic-model";
  jest.clearAllMocks();
  jest.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  jest.restoreAllMocks();
  for (const key of ["QA_ENABLED", "OPENAI_API_KEY", "OPENAI_QA_MODEL"]) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
});
async function ask(targetId: string, question = "What do reviewers say?") {
  return POST(
    new NextRequest("http://reviewlens.test/api/analysis-targets/" + targetId + "/questions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question }),
    }),
    { params: Promise.resolve({ targetId }) },
  );
}
it("switches A to B to A through the production route, builder, parser and complete provider bodies", async () => {
  const f = setup();
  jest.mocked(createOpenAiQaModel).mockReturnValue(f.deps.callModel);
  const previousQuestions: string[] = [];
  for (const [id, marker, excluded, question] of [
    [A, "ALPHA_PRIVATE_REVIEW_MARKER", "BETA_SERVICE_MARKER", "FIRST_ALPHA_QUESTION battery life?"],
    [B, "BETA_SERVICE_MARKER", "ALPHA_PRIVATE_REVIEW_MARKER", "BETA_QUESTION customer service?"],
    [
      A,
      "ALPHA_PRIVATE_REVIEW_MARKER",
      "BETA_SERVICE_MARKER",
      "RETURN_ALPHA_QUESTION battery life?",
    ],
  ] as const) {
    const response = await ask(id, question);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      success: true,
      data: { targetId: id, answer: expect.stringContaining(marker) },
    });
    const sent = f.outgoing.at(-1)!;
    const counted = f.countRequests.at(-1)!;
    expect(counted).toEqual(
      expect.objectContaining({
        model: sent.model,
        instructions: sent.instructions,
        input: sent.input,
        text: sent.text,
      }),
    );
    for (const body of [sent, counted]) {
      expect(JSON.stringify(body)).toContain(question);
      for (const old of previousQuestions) expect(JSON.stringify(body)).not.toContain(old);
      expect(JSON.stringify(body)).toContain(marker);
      expect(JSON.stringify(body)).not.toContain(excluded);
    }
    previousQuestions.push(question);
    expect(JSON.stringify(sent)).toContain(marker);
    expect(JSON.stringify(sent)).not.toContain(excluded);
    expect(JSON.stringify(sent)).not.toMatch(/OTHER_PRIVATE|EXCLUDE_|PRIVATE_ACCOUNT_EMAIL/);
  }
  expect(f.outgoing).toHaveLength(3);
  expect(f.countRequests).toHaveLength(3);
});
it("rebuilds B context from changed persisted fixture rows after switching", async () => {
  const f = setup();
  jest.mocked(createOpenAiQaModel).mockReturnValue(f.deps.callModel);
  await ask(A);
  await ask(B);
  const row = f.rows.find((r) => r.analysis_target_id === B)!;
  row.review_text = "BETA_UPDATED customer service";
  row.rating = 2;
  expect(await (await ask(B)).json()).toMatchObject({
    // The claim's quote is checked against the freshly persisted text, not the earlier row.
    data: {
      targetId: B,
      answer: `BETA_UPDATED customer service\n  "BETA_UPDATED customer service" [${row.id}]`,
    },
  });
  expect(JSON.stringify(f.outgoing.at(-1))).not.toContain("BETA_SERVICE_MARKER");
});
it("denies a foreign target after A without retaining context or invoking either provider endpoint", async () => {
  const f = setup();
  jest.mocked(createOpenAiQaModel).mockReturnValue(f.deps.callModel);
  await ask(A);
  const before = f.fetcher.mock.calls.length;
  const reads = f.reads.filter((p) => p.endsWith("/reviews")).length;
  const response = await ask(C);
  expect(response.status).toBe(404);
  expect(JSON.stringify(await response.json())).not.toMatch(/ALPHA_|OTHER_PRIVATE|review_text/);
  expect(f.fetcher).toHaveBeenCalledTimes(before);
  expect(f.reads.filter((p) => p.endsWith("/reviews"))).toHaveLength(reads);
});
it("fails B safely after A when context loading fails, without reusing A evidence", async () => {
  const f = setup();
  jest.mocked(createOpenAiQaModel).mockReturnValue(f.deps.callModel);
  await ask(A);
  const before = f.fetcher.mock.calls.length;
  f.failReviews();
  const response = await ask(B);
  expect(response.status).toBe(503);
  expect(JSON.stringify(await response.json())).not.toMatch(/ALPHA_|PRIVATE_DB/);
  expect(f.fetcher).toHaveBeenCalledTimes(before);
});

it.each(["missing", "empty", "logout"])(
  "fails safely after A on %s without another provider request",
  async (kind) => {
    const f = setup();
    jest.mocked(createOpenAiQaModel).mockReturnValue(f.deps.callModel);
    await ask(A);
    const before = f.fetcher.mock.calls.length;
    let target = B,
      status = 409;
    if (kind === "empty")
      f.rows.splice(
        f.rows.findIndex((r) => r.analysis_target_id === B),
        1,
      );
    if (kind === "missing") {
      target = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
      status = 404;
    }
    if (kind === "logout") {
      jest.mocked(getAuthenticatedUser).mockResolvedValue(null);
      status = 401;
    }
    const response = await ask(target);
    expect(response.status).toBe(status);
    expect(f.fetcher).toHaveBeenCalledTimes(before);
    expect(JSON.stringify(await response.json())).not.toMatch(/ALPHA_|BETA_|PRIVATE_ACCOUNT/);
  },
);

async function summary(targetId: string) {
  return getSummary(
    new NextRequest("http://reviewlens.test/api/analysis-targets/" + targetId + "/review-summary"),
    { params: Promise.resolve({ targetId }) },
  );
}
it("switches real summary-route aggregates with Q&A evidence and recomputes changed persisted B rows", async () => {
  const f = setup();
  jest.mocked(createOpenAiQaModel).mockReturnValue(f.deps.callModel);
  f.rows.push({ ...f.rows[0], id: "alpha-extra", rating: 2 });
  for (const [targetId, count, average] of [
    [A, 2, 3],
    [B, 1, 5],
    [A, 2, 3],
  ] as const) {
    expect((await ask(targetId)).status).toBe(200);
    const response = await summary(targetId);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toMatchObject({
      success: true,
      data: { targetId, reviewCount: count, averageRating: average },
    });
  }
  f.rows.find((row) => row.analysis_target_id === B)!.rating = 1;
  expect(await (await summary(B)).json()).toMatchObject({
    data: { targetId: B, reviewCount: 1, averageRating: 1 },
  });
  const before = f.reads.filter((path) => path.startsWith("summary:")).length;
  expect((await summary(C)).status).toBe(404);
  expect(f.reads.filter((path) => path.startsWith("summary:"))).toHaveLength(before);
});
