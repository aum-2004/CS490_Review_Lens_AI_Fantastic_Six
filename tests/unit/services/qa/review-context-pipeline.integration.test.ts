/** @jest-environment node */
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAuthenticatedUser } from "@/services/auth/auth-service";
import { buildReviewDatasetContext } from "@/services/qa/review-context";

jest.mock("server-only", () => ({}));
jest.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: jest.fn() }));
jest.mock("@/services/auth/auth-service", () => ({ getAuthenticatedUser: jest.fn() }));

// S2-011 is not on this main-based branch yet. Do not introduce a production
// dependency or duplicate its implementation to make this suite run. Once the actual
// source is present these tests load it; incomplete/broken dependencies then fail normally.
const qaAvailable = existsSync(
  resolve(__dirname, "../../../../src/services/qa/answer-question.ts"),
);
if (process.env.REQUIRE_QA_INTEGRATION === "true" && !qaAvailable) {
  throw new Error("Required S2-011 integration source is absent; these checks cannot be accepted.");
}
const describeQa = qaAvailable ? describe : describe.skip;

// Test-local structural subsets only, not a new shared API/model response contract.
interface ModelRequest {
  targetId: string;
  instructions: string;
  input: string;
  reviewIds: string[];
  maxOutputTokens: number;
}
type ModelCaller = (request: ModelRequest) => Promise<{ text: string }>;
interface AnswerModule {
  answerQuestion: (
    targetId: unknown,
    question: string,
    dependencies: {
      buildReviewDatasetContext: typeof buildReviewDatasetContext;
      callModel: ModelCaller;
    },
  ) => Promise<{ targetId: string; answer: string; citedReviewIds: string[] }>;
}
interface ClientModule {
  createOpenAiQaModel: (options: {
    fetcher: typeof fetch;
    env: Readonly<Record<string, string | undefined>>;
  }) => ModelCaller;
}
function answerQuestion(...args: Parameters<AnswerModule["answerQuestion"]>) {
  return jest.requireActual<AnswerModule>("@/services/qa/answer-question").answerQuestion(...args);
}
function createOpenAiQaModel(options: Parameters<ClientModule["createOpenAiQaModel"]>[0]) {
  return jest
    .requireActual<ClientModule>("@/services/qa/openai-qa-client")
    .createOpenAiQaModel(options);
}
function reservedOutputTokens() {
  return jest.requireActual<{ QA_RESERVED_OUTPUT_TOKENS: number }>("@/services/qa/system-prompt")
    .QA_RESERVED_OUTPUT_TOKENS;
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
  const fetcher = jest.fn(async (_input: Parameters<typeof fetch>[0], init?: RequestInit) => {
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
  });
  const deps = {
    buildReviewDatasetContext,
    callModel: createOpenAiQaModel({
      fetcher,
      env: {
        QA_ENABLED: "true",
        OPENAI_API_KEY: "synthetic-key-not-live",
        OPENAI_QA_MODEL: "synthetic-model",
      },
    }),
  };
  return {
    rows,
    reads,
    outgoing,
    fetcher,
    deps,
    failReviews: () => {
      failReviews = true;
    },
  };
}
beforeEach(() => jest.resetAllMocks());

describeQa("actual S2-010/S2-011 integration (deferred until S2-011 is present)", () => {
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

  it("rejects an estimated whole-request overflow before provider invocation", async () => {
    const { deps, fetcher } = setup();
    await expect(answerQuestion(A, "Q".repeat(60000), deps)).rejects.toMatchObject({
      code: "REQUEST_TOO_LARGE",
    });
    expect(fetcher).not.toHaveBeenCalled();
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
