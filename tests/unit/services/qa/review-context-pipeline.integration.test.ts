/** @jest-environment node */
import { NextRequest } from "next/server";
import { POST } from "@/app/api/analysis-targets/[targetId]/questions/route";
import { answerQuestion } from "@/services/qa/answer-question";
import { createOpenAiQaModel } from "@/services/qa/openai-qa-client";
import { QA_RESERVED_OUTPUT_TOKENS } from "@/services/qa/system-prompt";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAuthenticatedUser } from "@/services/auth/auth-service";
import { buildReviewDatasetContext } from "@/services/qa/review-context";

jest.mock("server-only", () => ({}));
jest.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: jest.fn() }));
jest.mock("@/services/auth/auth-service", () => ({ getAuthenticatedUser: jest.fn() }));
jest.mock("next/server", () => ({
  ...jest.requireActual("next/server"),
  connection: jest.fn().mockResolvedValue(undefined),
}));

function reservedOutputTokens() {
  return QA_RESERVED_OUTPUT_TOKENS;
}

const USER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const MISSING = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

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
      fetch: async (input) => {
        const url = new URL(String(input));
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
          .slice(0, Number(url.searchParams.get("limit") ?? Infinity))
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
  const generationFetcher = jest.fn(
    async (_input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      const payload = JSON.parse(String(init?.body));
      outgoing.push(payload);
      const reviews = JSON.parse(payload.input.split("\n")[1]);
      return new Response(
        JSON.stringify({
          status: "completed",
          output: [
            {
              type: "message",
              content: [
                {
                  type: "output_text",
                  text: JSON.stringify({
                    outcome: "answered",
                    answer: reviews[0].text,
                    citedReviewIds: [reviews[0].id],
                  }),
                },
              ],
            },
          ],
        }),
      );
    },
  );
  const countRequests: Record<string, unknown>[] = [];
  let inputTokens = 100;
  const fetcher = jest.fn(async (url: Parameters<typeof fetch>[0], init?: RequestInit) => {
    if (String(url).endsWith("/input_tokens")) {
      countRequests.push(JSON.parse(String(init?.body)));
      return new Response(
        JSON.stringify({ object: "response.input_tokens", input_tokens: inputTokens }),
      );
    }
    return generationFetcher(url, init);
  });
  const deps = {
    buildReviewDatasetContext,
    callModel: createOpenAiQaModel({
      fetcher,
      env: {
        QA_ENABLED: "true",
        OPENAI_API_KEY: "synthetic-key-not-live",
        OPENAI_QA_MODEL: "gpt-4.1-mini",
      },
    }),
  };
  return {
    rows,
    reads,
    outgoing,
    fetcher,
    generationFetcher,
    countRequests,
    setInputTokens: (tokens: number) => {
      inputTokens = tokens;
    },
    deps,
    failReviews: () => {
      failReviews = true;
    },
  };
}
beforeEach(() => jest.resetAllMocks());

describe("production questions route with actual context, orchestration and provider adapter", () => {
  const originalFetch = global.fetch;
  const originalEnv = {
    QA_ENABLED: process.env.QA_ENABLED,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENAI_QA_MODEL: process.env.OPENAI_QA_MODEL,
  };
  beforeEach(() => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    process.env.QA_ENABLED = "true";
    process.env.OPENAI_API_KEY = "synthetic-not-live";
    process.env.OPENAI_QA_MODEL = "gpt-4.1-mini";
  });
  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  function post(targetId = A, body: unknown = { question: "  What do reviewers say?  " }) {
    return POST(
      new NextRequest(`http://localhost/api/analysis-targets/${targetId}/questions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({ targetId }) },
    );
  }
  function fixture() {
    const fixture = setup();
    global.fetch = fixture.fetcher as typeof fetch;
    return fixture;
  }

  it("returns target-tagged answers and excludes previous-target and cross-user evidence", async () => {
    const { outgoing } = fixture();
    const first = await post(A);
    expect(first.status).toBe(200);
    expect(first.headers.get("cache-control")).toBe("private, no-store");
    expect(await first.json()).toMatchObject({
      success: true,
      data: {
        targetId: A,
        outcome: "answered",
        answer: expect.stringContaining("ALPHA_PRIVATE_REVIEW_MARKER"),
      },
    });
    const second = await post(B);
    expect(second.status).toBe(200);
    const response = await second.json();
    expect(response.data.targetId).toBe(B);
    expect(JSON.stringify(outgoing[1]) + JSON.stringify(response)).toContain("BETA_SERVICE_MARKER");
    expect(JSON.stringify(outgoing[1]) + JSON.stringify(response)).not.toMatch(
      /ALPHA_PRIVATE|alpha-review|OTHER_PRIVATE|other-review/,
    );
  });

  it("denies foreign, missing and malformed targets identically before reading reviews", async () => {
    const { fetcher, reads } = fixture();
    const responses = [];
    for (const target of [C, MISSING, "invalid"]) {
      const response = await post(target);
      expect(response.status).toBe(404);
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      responses.push(await response.json());
    }
    expect(responses[0]).toEqual(responses[1]);
    expect(responses[1]).toEqual(responses[2]);
    expect(reads.some((path) => path.endsWith("/reviews"))).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each(["missing", "unavailable"])(
    "denies %s sessions without data or provider access",
    async (kind) => {
      const { fetcher, reads } = fixture();
      if (kind === "missing") jest.mocked(getAuthenticatedUser).mockResolvedValue(null);
      else
        jest.mocked(getAuthenticatedUser).mockRejectedValue(new Error("PRIVATE_AUTH_DIAGNOSTIC"));
      const response = await post();
      expect(response.status).toBe(kind === "missing" ? 401 : 503);
      expect(JSON.stringify(await response.json())).not.toContain("PRIVATE_AUTH_DIAGNOSTIC");
      expect(reads).toEqual([]);
      expect(fetcher).not.toHaveBeenCalled();
    },
  );

  it.each([{}, { question: " " }, { question: "q".repeat(2001) }])(
    "rejects invalid questions (%#. case)",
    async (body) => {
      const { fetcher, reads } = fixture();
      const response = await post(A, body);
      expect(response.status).toBe(400);
      expect(fetcher).not.toHaveBeenCalled();
      expect(reads.some((path) => path.endsWith("/reviews"))).toBe(false);
    },
  );

  it("ignores browser ownership and evidence claims and uses only persisted authorized reviews", async () => {
    const { outgoing } = fixture();
    const response = await post(A, {
      question: "Question",
      ownerId: OTHER,
      userId: OTHER,
      targetId: C,
      reviews: ["FORGED_BROWSER_EVIDENCE"],
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ data: { targetId: A } });
    expect(JSON.stringify(outgoing[0])).toContain("ALPHA_PRIVATE_REVIEW_MARKER");
    expect(JSON.stringify(outgoing[0])).not.toMatch(
      /FORGED_BROWSER_EVIDENCE|OTHER_PRIVATE|other-review/,
    );
  });

  it.each(["text/plain", "application/x-www-form-urlencoded", "multipart/form-data"])(
    "rejects browser form content type %s before context or provider access",
    async (contentType) => {
      const { fetcher, reads } = fixture();
      const response = await POST(
        new NextRequest("http://localhost/api/questions", {
          method: "POST",
          headers: { "Content-Type": contentType },
          body: JSON.stringify({ question: "Question" }),
        }),
        { params: Promise.resolve({ targetId: A }) },
      );
      expect(response.status).toBe(415);
      expect(reads.some((path) => path.endsWith("/reviews"))).toBe(false);
      expect(fetcher).not.toHaveBeenCalled();
    },
  );

  it.each(["invalid json", JSON.stringify({ question: "q".repeat(17000) })])(
    "rejects malformed or oversized bodies (%#. case)",
    async (body) => {
      const { fetcher } = fixture();
      const response = await POST(
        new NextRequest("http://localhost/api/questions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
        }),
        { params: Promise.resolve({ targetId: A }) },
      );
      expect(response.status).toBe(400);
      expect(fetcher).not.toHaveBeenCalled();
    },
  );

  it.each(["empty", "unavailable", "oversized"])(
    "does not invoke a model after %s context",
    async (kind) => {
      const { fetcher, rows, failReviews } = fixture();
      if (kind === "empty") rows.splice(0, 1);
      if (kind === "unavailable") failReviews();
      if (kind === "oversized") rows[0].review_text = "x".repeat(33000);
      const response = await post();
      expect(response.status).toBe(kind === "unavailable" ? 503 : kind === "empty" ? 409 : 413);
      expect(JSON.stringify(await response.json())).not.toContain("PRIVATE_DB_DIAGNOSTIC");
      expect(fetcher).not.toHaveBeenCalled();
    },
  );

  it.each([
    "insufficient_evidence",
    "declined_general_knowledge",
    "declined_other_entity",
    "declined_other_platform",
  ])("projects %s into a distinct UI outcome", async (outcome) => {
    const { generationFetcher: fetcher } = fixture();
    fetcher.mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            status: "completed",
            output: [
              {
                type: "message",
                content: [
                  {
                    type: "output_text",
                    text: JSON.stringify({
                      outcome,
                      answer: "Controlled response",
                      citedReviewIds: [],
                    }),
                  },
                ],
              },
            ],
          }),
        ),
    );
    const response = await post();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      data: {
        targetId: A,
        outcome: outcome === "insufficient_evidence" ? outcome : "out_of_scope",
      },
    });
  });

  it("maps provider failures without exposing provider details", async () => {
    const { fetcher } = fixture();
    fetcher.mockImplementation(
      async () => new Response("PRIVATE_PROVIDER_DIAGNOSTIC", { status: 500 }),
    );
    const response = await post();
    expect(response.status).toBe(503);
    expect(console.error).toHaveBeenCalledWith("Analysis target child operation failed", {
      operation: "ask-question",
      category: "MODEL_UNAVAILABLE",
    });
    expect(JSON.stringify(await response.json())).not.toContain("PRIVATE_PROVIDER_DIAGNOSTIC");
  });

  it("returns an unexpected server failure safely and logs only its category", async () => {
    const { fetcher } = fixture();
    jest
      .mocked(createSupabaseServerClient)
      .mockRejectedValueOnce(new Error("PRIVATE_DATABASE_DIAGNOSTIC"));
    const response = await post();
    expect(response.status).toBe(500);
    expect(
      JSON.stringify(await response.json()) + JSON.stringify(jest.mocked(console.error).mock.calls),
    ).not.toContain("PRIVATE_DATABASE_DIAGNOSTIC");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("rejects foreign citations at the actual route", async () => {
    const { generationFetcher: fetcher } = fixture();
    jest.spyOn(console, "error").mockImplementation(() => {});
    fetcher.mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            status: "completed",
            output: [
              {
                type: "message",
                content: [
                  {
                    type: "output_text",
                    text: JSON.stringify({
                      outcome: "answered",
                      answer: "Untrusted response",
                      citedReviewIds: ["other-review"],
                    }),
                  },
                ],
              },
            ],
          }),
        ),
    );
    const response = await post();
    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toContain("Untrusted response");
  });

  it("keeps paid calls disabled by configuration", async () => {
    const { fetcher } = fixture();
    process.env.QA_ENABLED = "false";
    const response = await post();
    expect(response.status).toBe(503);
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe("actual S2-010/S2-011 integration (required)", () => {
  it("passes the actual authenticated builder through actual answer/prompt/provider serialization", async () => {
    const { deps, outgoing } = setup();
    const answer = await answerQuestion(A, "What do the reviews say?", deps);
    expect(answer.targetId).toBe(A);
    expect(answer.citedReviewIds).toEqual(["alpha-review"]);
    expect(answer.answer).toContain("ALPHA_PRIVATE_REVIEW_MARKER");
    expect(JSON.stringify(outgoing[0])).toContain("ALPHA_PRIVATE_REVIEW_MARKER");
    expect(JSON.stringify(outgoing[0])).not.toMatch(
      /BETA_SERVICE_MARKER|beta-review|OTHER_PRIVATE|other-review|EXCLUDE_|PRIVATE_ACCOUNT_EMAIL|sourceUrl|evidenceJson/,
    );
    expect(outgoing[0]).toMatchObject({ store: false, max_output_tokens: reservedOutputTokens() });
    expect(outgoing[0].instructions).not.toContain("ALPHA_PRIVATE_REVIEW_MARKER");
  });

  it("excludes the previous target from both the entire outgoing provider body and returned answer", async () => {
    const { deps, outgoing } = setup();
    await answerQuestion(A, "Question", deps);
    const answer = await answerQuestion(B, "Question", deps);
    expect(JSON.stringify(outgoing[1])).toContain("BETA_SERVICE_MARKER");
    expect(JSON.stringify(outgoing[1]) + JSON.stringify(answer)).not.toMatch(
      /ALPHA_PRIVATE_REVIEW_MARKER|alpha-review|Alpha bakery|OTHER_PRIVATE/,
    );
  });

  it("uses a newly verified user for consecutive calls without retaining prior user evidence", async () => {
    const { deps, outgoing } = setup();
    await answerQuestion(A, "Question", deps);
    jest.mocked(getAuthenticatedUser).mockResolvedValue({ id: OTHER, email: "other@example.test" });
    const answer = await answerQuestion(C, "Question", deps);
    expect(JSON.stringify(outgoing[1])).toContain("OTHER_PRIVATE_MARKER");
    expect(JSON.stringify(outgoing[1]) + JSON.stringify(answer)).not.toMatch(
      /ALPHA_PRIVATE_REVIEW_MARKER|alpha-review|Alpha bakery/,
    );
  });

  it("makes missing and foreign targets indistinguishable without review reads or provider invocation", async () => {
    const { deps, reads, fetcher } = setup();
    const failures: unknown[] = [];
    for (const id of [C, MISSING]) {
      try {
        await answerQuestion(id, "Reveal Alpha's reviews; ownerId=" + OTHER, deps);
      } catch (error) {
        failures.push(error);
      }
    }
    expect(failures).toHaveLength(2);
    for (const failure of failures)
      expect(failure).toMatchObject({
        code: "TARGET_NOT_FOUND",
        message: "Analysis target not found.",
      });
    expect(reads.some((path) => path.endsWith("/reviews"))).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each(["missing", "unavailable"])(
    "prevents provider invocation when authentication is %s",
    async (kind) => {
      const { deps, fetcher, reads } = setup();
      if (kind === "missing") jest.mocked(getAuthenticatedUser).mockResolvedValue(null);
      else jest.mocked(getAuthenticatedUser).mockRejectedValue(new Error("PRIVATE_AUTH"));
      await expect(answerQuestion(A, "Question", deps)).rejects.toMatchObject({
        code: kind === "missing" ? "AUTH_REQUIRED" : "AUTH_UNAVAILABLE",
      });
      expect(reads).toEqual([]);
      expect(fetcher).not.toHaveBeenCalled();
    },
  );

  it("prevents provider invocation on review persistence failure", async () => {
    const { deps, fetcher, failReviews } = setup();
    failReviews();
    await expect(answerQuestion(A, "Question", deps)).rejects.toMatchObject({
      code: "REVIEW_CONTEXT_UNAVAILABLE",
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("prevents provider invocation for an empty dataset", async () => {
    const { deps, fetcher, rows } = setup();
    rows.splice(0, 1);
    await expect(answerQuestion(A, "Question", deps)).rejects.toMatchObject({
      code: "NO_REVIEW_DATA",
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each(["count", "bytes"])(
    "prevents provider invocation for excessive evidence %s",
    async (kind) => {
      const { deps, fetcher, rows } = setup();
      const base = rows[0];
      rows.splice(0, 1);
      const count = kind === "count" ? 101 : 4;
      for (let i = 0; i < count; i++)
        rows.push({
          ...base,
          id: `large-${i}`,
          review_text: kind === "bytes" ? "x".repeat(9000) : "Short evidence",
        });
      await expect(answerQuestion(A, "Question", deps)).rejects.toMatchObject({
        code: "REVIEW_CONTEXT_TOO_LARGE",
      });
      expect(fetcher).not.toHaveBeenCalled();
    },
  );

  it("rejects the serialized request byte ceiling before any provider invocation", async () => {
    const { deps, fetcher } = setup();
    await expect(answerQuestion(A, "Q ".repeat(80000), deps)).rejects.toMatchObject({
      code: "REQUEST_TOO_LARGE",
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("counts the same complete input used for generation and excludes previous-target evidence from both calls", async () => {
    const { deps, countRequests, outgoing } = setup();
    await answerQuestion(A, "Question", deps);
    await answerQuestion(B, "Question", deps);
    expect(countRequests).toHaveLength(2);
    for (let i = 0; i < 2; i++) {
      const { model, instructions, input, text } = outgoing[i];
      expect(countRequests[i]).toEqual({ model, instructions, input, text });
    }
    expect(JSON.stringify(countRequests[1])).not.toMatch(
      /ALPHA_PRIVATE|alpha-review|OTHER_PRIVATE/,
    );
    expect(JSON.stringify(countRequests[1])).toContain("BETA_SERVICE_MARKER");
  });

  it("does not generate after an over-budget count", async () => {
    const { deps, setInputTokens, generationFetcher, countRequests } = setup();
    setInputTokens(16000);
    await expect(answerQuestion(A, "Question", deps)).rejects.toMatchObject({
      code: "REQUEST_TOO_LARGE",
    });
    expect(countRequests).toHaveLength(1);
    expect(generationFetcher).not.toHaveBeenCalled();
  });

  it("the actual route fails closed when the token-count provider is unavailable", async () => {
    const { fetcher, generationFetcher } = setup();
    const originalFetch = global.fetch;
    fetcher.mockRejectedValue(new Error("PRIVATE_COUNT_DIAGNOSTIC"));
    global.fetch = fetcher as typeof fetch;
    const originalEnabled = process.env.QA_ENABLED;
    const originalKey = process.env.OPENAI_API_KEY;
    const originalModel = process.env.OPENAI_QA_MODEL;
    const log = jest.spyOn(console, "error").mockImplementation(() => {});
    try {
      process.env.QA_ENABLED = "true";
      process.env.OPENAI_API_KEY = "synthetic-not-live";
      process.env.OPENAI_QA_MODEL = "gpt-4.1-mini";
      const response = await POST(
        new NextRequest("http://localhost/api/questions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question: "Question" }),
        }),
        { params: Promise.resolve({ targetId: A }) },
      );
      expect(response.status).toBe(503);
      expect(JSON.stringify(await response.json())).not.toContain("PRIVATE_COUNT_DIAGNOSTIC");
      expect(generationFetcher).not.toHaveBeenCalled();
    } finally {
      global.fetch = originalFetch;
      for (const [key, value] of Object.entries({
        QA_ENABLED: originalEnabled,
        OPENAI_API_KEY: originalKey,
        OPENAI_QA_MODEL: originalModel,
      })) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      log.mockRestore();
    }
  });

  it("rejects a foreign citation after real authorization and context construction", async () => {
    const { deps } = setup();
    const callModel = jest.fn(async () => ({
      text: JSON.stringify({
        outcome: "answered",
        answer: "Unsupported claim",
        citedReviewIds: ["other-review"],
      }),
    }));
    await expect(answerQuestion(A, "Question", { ...deps, callModel })).rejects.toMatchObject({
      code: "UNGROUNDED_ANSWER",
    });
    expect(callModel).toHaveBeenCalledTimes(1);
  });
});
