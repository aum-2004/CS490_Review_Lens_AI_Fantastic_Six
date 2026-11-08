/** @jest-environment node */
// S1-013: cross-user authorization for the AnalysisTarget child routes (reviews and ingestion).
// The real auth guard, ownership helper, repository, review service, and normalizer run. Only the
// Supabase client (an in-memory fake), the session lookup, and the review provider are replaced,
// so nothing here calls a live service.
import { NextRequest } from "next/server";

import * as ingestionRoute from "@/app/api/analysis-targets/[targetId]/ingestion/route";
import * as ingestionRefreshRoute from "@/app/api/analysis-targets/[targetId]/ingestion/refresh/route";
import {
  MAX_REQUEST_BODY_BYTES,
  MAX_REVIEW_DATE_CHARS,
  MAX_REVIEW_METADATA_BYTES,
  MAX_REVIEW_TEXT_CHARS,
  MAX_REVIEW_URL_CHARS,
  MAX_REVIEWER_NAME_CHARS,
  MAX_SOURCE_REVIEW_ID_CHARS,
} from "@/app/api/analysis-targets/[targetId]/reviews/review-input";
import * as reviewsRoute from "@/app/api/analysis-targets/[targetId]/reviews/route";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createIngestionAdminClient } from "@/lib/supabase/ingestion-admin";
import { ingestionRecoveryUrl } from "@/services/ingestion/ingestion-recovery";
import { getAuthenticatedUser } from "@/services/auth/auth-service";
import {
  getOutscraperResult,
  startOutscraperExtraction,
} from "@/services/ingestion/outscraper-client";
import { getExtractedReviews } from "@/services/ingestion/outscraper-service";
import { normalizeBatch } from "@/services/reviews/normalize";

jest.mock("@/services/auth/auth-service", () => ({ getAuthenticatedUser: jest.fn() }));
jest.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: jest.fn() }));
jest.mock("@/lib/supabase/ingestion-admin", () => ({ createIngestionAdminClient: jest.fn() }));
jest.mock("next/server", () => ({
  ...jest.requireActual("next/server"),
  connection: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@/services/ingestion/outscraper-client", () => ({
  ...jest.requireActual("@/services/ingestion/outscraper-client"),
  startOutscraperExtraction: jest.fn(),
  getOutscraperResult: jest.fn(),
}));
jest.mock("@/services/ingestion/outscraper-service", () => ({ getExtractedReviews: jest.fn() }));
jest.mock("@/services/reviews/normalize", () => {
  const actual = jest.requireActual("@/services/reviews/normalize");
  return { ...actual, normalizeBatch: jest.fn(actual.normalizeBatch) };
});

const USER_A = { id: "11111111-1111-4111-8111-111111111111", email: "a@example.com" };
const USER_B = { id: "22222222-2222-4222-8222-222222222222", email: "b@example.com" };
const TARGET_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TARGET_A_NO_SOURCE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2";
const TARGET_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const MISSING_TARGET = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const PLACE_ID_A = "ChIJAAAAAAAAAAAAAAAAAAAAAAA";

type Row = Record<string, unknown>;

function targetRow(id: string, ownerId: string, googlePlaceId: string | null): Row {
  return {
    id,
    owner_id: ownerId,
    name: `Target ${id.slice(0, 4)}`,
    platform: "google_maps",
    source_url: "https://www.google.com/maps/place/Example",
    google_place_id: googlePlaceId,
    created_at: "2026-11-01T00:00:00Z",
  };
}

function reviewRow(id: string, targetId: string, text: string): Row {
  return {
    id,
    analysis_target_id: targetId,
    review_text: text,
    rating: 4,
    source_review_id: null,
    reviewer_name: null,
    review_date: null,
    review_url: null,
    source_metadata: null,
    created_at: "2026-11-02T00:00:00Z",
  };
}

/**
 * Minimal in-memory stand-in for the supabase-js query builder: select/eq/order/range/insert and
 * maybeSingle, which is all the repository and review store use. It applies eq filters, so the
 * repository's owner_id filter behaves as it does against Supabase.
 */
function useDatabase() {
  const tables: Record<string, Row[]> = {
    analysis_targets: [
      targetRow(TARGET_A, USER_A.id, PLACE_ID_A),
      targetRow(TARGET_A_NO_SOURCE, USER_A.id, null),
      targetRow(TARGET_B, USER_B.id, null),
    ],
    reviews: [reviewRow("r-a1", TARGET_A, "User A's existing review")],
    ingestion_attempts: [],
  };
  let nextId = 1;

  const from = jest.fn((table: string) => {
    const filters: [string, unknown][] = [];
    let pendingInsert: Row[] | undefined;
    let window: [number, number] | undefined;

    const run = () => {
      if (pendingInsert) {
        const created = pendingInsert.map((row) => ({
          id: `r-new-${nextId++}`,
          created_at: "2026-11-06T00:00:00Z",
          ...row,
        }));
        tables[table].push(...created);
        return { data: created, error: null };
      }
      let rows = tables[
        table === "latest_ingestion_attempts" ? "ingestion_attempts" : table
      ].filter((row) => filters.every(([col, val]) => row[col] === val));
      if (table === "latest_ingestion_attempts") rows = rows.slice(-1);
      if (window) rows = rows.slice(window[0], window[1] + 1);
      return { data: rows, error: null };
    };

    const query = {
      select: () => query,
      insert: (rows: Row | Row[]) => {
        pendingInsert = Array.isArray(rows) ? rows : [rows];
        return query;
      },
      eq: (column: string, value: unknown) => {
        filters.push([column, value]);
        return query;
      },
      order: () => query,
      range: (start: number, end: number) => {
        window = [start, end];
        return query;
      },
      maybeSingle: async () => ({ data: run().data[0] ?? null, error: null }),
      then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
        Promise.resolve(run()).then(resolve, reject),
    };
    return query;
  });

  jest.mocked(createSupabaseServerClient).mockResolvedValue({ from } as never);
  jest.mocked(createIngestionAdminClient).mockReturnValue({
    rpc: jest.fn(async (name, args) => {
      if (name === "reserve_ingestion_attempt") {
        const existing = tables.ingestion_attempts.find(
          (row) =>
            row.analysis_target_id === args.p_target_id &&
            (["processing", "succeeded"].includes(String(row.status)) ||
              ["SUBMISSION_UNCERTAIN", "RESULT_WINDOW_EXPIRED"].includes(String(row.error_code))),
        );
        if (existing) return { data: { attempt: existing, created: false }, error: null };
        const target = tables.analysis_targets.find(
          (row) => row.id === args.p_target_id && row.owner_id === args.p_owner_id,
        )!;
        const attempt = {
          id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
          analysis_target_id: target.id,
          owner_id: target.owner_id,
          source_url: target.source_url,
          submitted_query: target.google_place_id ?? target.source_url,
          query_kind: target.google_place_id ? "place_id" : "source_url",
          expected_place_id: target.google_place_id,
          provider_request_id: null,
          status: "processing",
          started_at: "2026-11-06T12:00:00Z",
          finished_at: null,
          saved_count: 0,
          skipped_count: 0,
          error_code: null,
          identity_basis: null,
          verified_identity: null,
        };
        tables.ingestion_attempts.push(attempt);
        return { data: { attempt, created: true }, error: null };
      }
      const attempt = tables.ingestion_attempts.find((row) => row.id === args.p_attempt_id)!;
      if (name === "bind_ingestion_job") attempt.provider_request_id = args.p_request_id;
      if (name === "finish_ingestion_attempt" && attempt.status === "processing") {
        const reviews = args.p_reviews as Row[];
        tables.reviews.push(
          ...reviews.map((review, index) => ({
            ...review,
            id: "ingested-" + index,
            analysis_target_id: attempt.analysis_target_id,
          })),
        );
        Object.assign(attempt, {
          status: args.p_error_code ? "failed" : "succeeded",
          error_code: args.p_error_code,
          saved_count: reviews.length,
          skipped_count: args.p_skipped_count,
          finished_at: "2026-11-06T12:01:00Z",
          identity_basis: args.p_error_code
            ? null
            : attempt.query_kind === "source_url"
              ? "provider_resolved"
              : "expected_place_id",
          verified_identity: args.p_identity,
        });
      }
      return { data: attempt, error: null };
    }),
  } as never);
  const tablesTouched = () => from.mock.calls.map(([table]) => table);
  return { tables, tablesTouched };
}

function signInAs(user: typeof USER_A | null) {
  jest.mocked(getAuthenticatedUser).mockResolvedValue(user);
}

function ctx(targetId: string) {
  return { params: Promise.resolve({ targetId }) };
}

function request(path: string, method: string, body?: unknown) {
  return new NextRequest(`http://localhost${path}`, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const getReviews = (targetId: string, query = "") =>
  reviewsRoute.GET(
    request(`/api/analysis-targets/${targetId}/reviews${query}`, "GET"),
    ctx(targetId) as never,
  );
const postReviews = (targetId: string, body: unknown) =>
  reviewsRoute.POST(
    request(`/api/analysis-targets/${targetId}/reviews`, "POST", body),
    ctx(targetId) as never,
  );
/** Sends `body` exactly as given (no JSON encoding), optionally with extra headers. */
const postReviewsRaw = (targetId: string, body: string, headers?: Record<string, string>) =>
  reviewsRoute.POST(
    new NextRequest(`http://localhost/api/analysis-targets/${targetId}/reviews`, {
      method: "POST",
      body,
      headers,
    }),
    ctx(targetId) as never,
  );
const postIngestion = (targetId: string, body?: unknown) =>
  ingestionRoute.POST(
    request(`/api/analysis-targets/${targetId}/ingestion`, "POST", body),
    ctx(targetId) as never,
  );

const NOT_FOUND_BODY = {
  success: false,
  error: { code: "TARGET_NOT_FOUND", message: "Analysis target not found." },
};
const SPOOFED_OWNER = {
  ownerId: USER_A.id,
  owner_id: USER_A.id,
  userId: USER_A.id,
  user_id: USER_A.id,
};
const validReview = { text: "Lovely place", rating: 5 };

beforeEach(() => {
  process.env.INGESTION_CALLBACK_ORIGIN = "https://app.example.com";
  process.env.INGESTION_CALLBACK_SECRET = "synthetic-test-secret-that-is-not-a-real-key";
  process.env.INGESTION_ENABLED = "true";
  process.env.PROVIDER_REVIEW_STORAGE_APPROVED = "true";
  process.env.PROVIDER_REVIEW_STORAGE_APPROVAL_REFERENCE = "synthetic-test-only";
  jest.clearAllMocks();
  jest.spyOn(console, "error").mockImplementation(() => {});
  jest.mocked(startOutscraperExtraction).mockResolvedValue({ id: "job-1", status: "Pending" });
});

async function expectNotFound(response: Response) {
  expect(response.status).toBe(404);
  expect(response.headers.get("Cache-Control")).toContain("no-store");
  await expect(response.json()).resolves.toEqual(NOT_FOUND_BODY);
}

describe("GET /api/analysis-targets/[targetId]/reviews", () => {
  it("lets User A read the reviews of their own target", async () => {
    signInAs(USER_A);
    useDatabase();

    const response = await getReviews(TARGET_A);

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual([
      expect.objectContaining({ id: "r-a1", analysisTargetId: TARGET_A }),
    ]);
  });

  it("denies User B reading User A's target reviews without querying reviews", async () => {
    signInAs(USER_B);
    const { tablesTouched } = useDatabase();

    await expectNotFound(await getReviews(TARGET_A));
    expect(tablesTouched()).not.toContain("reviews");
  });

  it("gives a foreign target the same response as a missing or malformed id", async () => {
    signInAs(USER_B);
    useDatabase();

    const responses = await Promise.all(
      [TARGET_A, MISSING_TARGET, "not-a-uuid"].map((id) => getReviews(id)),
    );
    const bodies = await Promise.all(responses.map((response) => response.json()));

    expect(responses.map((response) => response.status)).toEqual([404, 404, 404]);
    expect(bodies).toEqual([NOT_FOUND_BODY, NOT_FOUND_BODY, NOT_FOUND_BODY]);
  });

  it("ignores a spoofed owner in the query string", async () => {
    signInAs(USER_B);
    const { tablesTouched } = useDatabase();

    await expectNotFound(await getReviews(TARGET_A, `?ownerId=${USER_A.id}&userId=${USER_A.id}`));
    expect(tablesTouched()).not.toContain("reviews");
  });

  it("rejects an unauthenticated request before creating a database client", async () => {
    signInAs(null);
    useDatabase();

    const response = await getReviews(TARGET_A);

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "AUTH_REQUIRED" } });
    expect(createSupabaseServerClient).not.toHaveBeenCalled();
  });
});

describe("POST /api/analysis-targets/[targetId]/reviews", () => {
  it("lets User A create a review under their own target", async () => {
    signInAs(USER_A);
    const { tables } = useDatabase();

    const response = await postReviews(TARGET_A, { reviews: [validReview] });

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.data).toEqual([
      expect.objectContaining({ analysisTargetId: TARGET_A, text: "Lovely place", rating: 5 }),
    ]);
    expect(tables.reviews.filter((row) => row.analysis_target_id === TARGET_A)).toHaveLength(2);
  });

  it("stores under the URL's target even if the body names another target or owner", async () => {
    signInAs(USER_A);
    const { tables } = useDatabase();

    const response = await postReviews(TARGET_A, {
      ...SPOOFED_OWNER,
      ownerId: USER_B.id,
      analysisTargetId: TARGET_B,
      reviews: [{ ...validReview, analysisTargetId: TARGET_B, analysis_target_id: TARGET_B }],
    });

    expect(response.status).toBe(201);
    expect(tables.reviews.filter((row) => row.analysis_target_id === TARGET_B)).toHaveLength(0);
  });

  it("denies User B creating reviews under User A's target before reading the body", async () => {
    signInAs(USER_B);
    const { tables, tablesTouched } = useDatabase();
    const before = structuredClone(tables.reviews);

    await expectNotFound(await postReviews(TARGET_A, { reviews: [validReview] }));

    expect(normalizeBatch).not.toHaveBeenCalled();
    expect(tablesTouched()).not.toContain("reviews");
    expect(tables.reviews).toEqual(before);
  });

  it("still denies User B when the body claims User A's identity", async () => {
    signInAs(USER_B);
    const { tables } = useDatabase();
    const before = structuredClone(tables.reviews);

    await expectNotFound(await postReviews(TARGET_A, { ...SPOOFED_OWNER, reviews: [validReview] }));
    expect(tables.reviews).toEqual(before);
  });

  it.each([
    ["no reviews array", {}],
    ["an empty batch", { reviews: [] }],
    ["an invalid review", { reviews: [validReview, { text: "", rating: 9 }] }],
    ["too many reviews", { reviews: Array.from({ length: 101 }, () => validReview) }],
  ])("rejects %s from the owner and saves nothing", async (_label, body) => {
    signInAs(USER_A);
    const { tables } = useDatabase();
    const before = structuredClone(tables.reviews);

    const response = await postReviews(TARGET_A, body);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "INVALID_REVIEW_INPUT" },
    });
    expect(tables.reviews).toEqual(before);
  });

  it("rejects an unauthenticated request before creating a database client", async () => {
    signInAs(null);
    useDatabase();

    const response = await postReviews(TARGET_A, { ...SPOOFED_OWNER, reviews: [validReview] });

    expect(response.status).toBe(401);
    expect(createSupabaseServerClient).not.toHaveBeenCalled();
  });
});

describe("POST /api/analysis-targets/[targetId]/reviews input size limits", () => {
  // Asserts a 400 INVALID_REVIEW_INPUT where neither the normalizer nor the review store ran.
  async function expectRejectedBeforeProcessing(
    response: Response,
    db: ReturnType<typeof useDatabase>,
    before: Row[],
  ) {
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: { code: "INVALID_REVIEW_INPUT" },
    });
    expect(normalizeBatch).not.toHaveBeenCalled();
    expect(db.tablesTouched()).not.toContain("reviews");
    expect(db.tables.reviews).toEqual(before);
  }

  it("accepts review text at exactly the character limit", async () => {
    signInAs(USER_A);
    const { tables } = useDatabase();
    const text = "a".repeat(MAX_REVIEW_TEXT_CHARS);

    const response = await postReviews(TARGET_A, { reviews: [{ text, rating: 5 }] });

    expect(response.status).toBe(201);
    expect(tables.reviews.at(-1)?.review_text).toBe(text);
  });

  it("counts characters, not UTF-16 units, so limit-length emoji text is accepted", async () => {
    signInAs(USER_A);
    useDatabase();
    const text = "😀".repeat(MAX_REVIEW_TEXT_CHARS);

    const response = await postReviews(TARGET_A, { reviews: [{ text, rating: 5 }] });

    expect(response.status).toBe(201);
  });

  it("rejects review text one character over the limit", async () => {
    signInAs(USER_A);
    const db = useDatabase();
    const before = structuredClone(db.tables.reviews);

    const response = await postReviews(TARGET_A, {
      reviews: [validReview, { text: "a".repeat(MAX_REVIEW_TEXT_CHARS + 1), rating: 5 }],
    });

    await expectRejectedBeforeProcessing(response, db, before);
  });

  it.each([
    ["reviewerName", { reviewerName: "n".repeat(MAX_REVIEWER_NAME_CHARS + 1) }],
    ["sourceReviewId", { sourceReviewId: "s".repeat(MAX_SOURCE_REVIEW_ID_CHARS + 1) }],
    ["reviewUrl", { reviewUrl: `https://maps.google.com/${"u".repeat(MAX_REVIEW_URL_CHARS)}` }],
    ["reviewDate", { reviewDate: "2".repeat(MAX_REVIEW_DATE_CHARS + 1) }],
    ["metadata", { metadata: { note: "m".repeat(MAX_REVIEW_METADATA_BYTES) } }],
  ])("rejects an oversized %s", async (_field, oversized) => {
    signInAs(USER_A);
    const db = useDatabase();
    const before = structuredClone(db.tables.reviews);

    const response = await postReviews(TARGET_A, { reviews: [{ ...validReview, ...oversized }] });

    await expectRejectedBeforeProcessing(response, db, before);
  });

  it("rejects a body over the byte limit while streaming, without a Content-Length", async () => {
    signInAs(USER_A);
    const db = useDatabase();
    const before = structuredClone(db.tables.reviews);
    // Every review is valid and within the field limits; only the ignored `junk` field makes the
    // body too large. So the stream limit is the only check that can reject this request.
    const body = JSON.stringify({
      reviews: [validReview],
      junk: "x".repeat(MAX_REQUEST_BODY_BYTES + 1),
    });

    const response = await postReviewsRaw(TARGET_A, body);

    await expectRejectedBeforeProcessing(response, db, before);
  });

  it("rejects a declared Content-Length over the byte limit", async () => {
    signInAs(USER_A);
    const db = useDatabase();
    const before = structuredClone(db.tables.reviews);

    const response = await postReviewsRaw(TARGET_A, JSON.stringify({ reviews: [validReview] }), {
      "content-length": String(MAX_REQUEST_BODY_BYTES + 1),
    });

    await expectRejectedBeforeProcessing(response, db, before);
  });

  it("still denies User B before applying any size checks", async () => {
    signInAs(USER_B);
    const { tablesTouched } = useDatabase();

    await expectNotFound(await postReviewsRaw(TARGET_A, "x".repeat(MAX_REQUEST_BODY_BYTES + 1)));
    expect(normalizeBatch).not.toHaveBeenCalled();
    expect(tablesTouched()).not.toContain("reviews");
  });
});

describe("POST /api/analysis-targets/[targetId]/ingestion", () => {
  it("lets User A start ingestion for their own target", async () => {
    signInAs(USER_A);
    useDatabase();

    const response = await postIngestion(TARGET_A);

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({
      success: true,
      data: {
        state: "processing",
        startedAt: "2026-11-06T12:00:00Z",
        finishedAt: null,
        savedCount: 0,
        skippedCount: 0,
        errorCode: null,
        identityBasis: null,
        providerBusinessName: null,
      },
    });
    expect(startOutscraperExtraction).toHaveBeenCalledTimes(1);
    expect(startOutscraperExtraction).toHaveBeenCalledWith(
      { kind: "place_id", value: PLACE_ID_A },
      undefined,
      ingestionRecoveryUrl("dddddddd-dddd-4ddd-8ddd-dddddddddddd"),
    );
  });

  it("submits an owned source URL without requiring a Place ID", async () => {
    signInAs(USER_A);
    useDatabase();

    const response = await postIngestion(TARGET_A_NO_SOURCE);

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toMatchObject({ data: { state: "processing" } });
    expect(startOutscraperExtraction).toHaveBeenCalledWith(
      { kind: "source_url", value: "https://www.google.com/maps/place/Example" },
      undefined,
      expect.stringContaining("/api/ingestion/provider-callback/"),
    );
  });

  it("denies User B ingesting against User A's target, and no review processing runs", async () => {
    signInAs(USER_B);
    const { tables, tablesTouched } = useDatabase();
    const before = structuredClone(tables);

    await expectNotFound(await postIngestion(TARGET_A));

    expect(startOutscraperExtraction).not.toHaveBeenCalled();
    expect(getOutscraperResult).not.toHaveBeenCalled();
    expect(getExtractedReviews).not.toHaveBeenCalled();
    expect(normalizeBatch).not.toHaveBeenCalled();
    expect(tablesTouched()).not.toContain("reviews");
    expect(tables).toEqual(before);
  });

  it("still denies User B when the body claims User A's identity", async () => {
    signInAs(USER_B);
    useDatabase();

    await expectNotFound(await postIngestion(TARGET_A, { ...SPOOFED_OWNER, targetId: TARGET_A }));
    expect(startOutscraperExtraction).not.toHaveBeenCalled();
  });

  it("rejects an unauthenticated request before creating a database client", async () => {
    signInAs(null);
    useDatabase();

    const response = await postIngestion(TARGET_A, SPOOFED_OWNER);

    expect(response.status).toBe(401);
    expect(createSupabaseServerClient).not.toHaveBeenCalled();
    expect(startOutscraperExtraction).not.toHaveBeenCalled();
  });

  it("records a failed attempt without exposing provider details", async () => {
    signInAs(USER_A);
    useDatabase();
    jest.mocked(startOutscraperExtraction).mockRejectedValue(new Error("secret provider detail"));

    const response = await postIngestion(TARGET_A);

    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).toContain("SUBMISSION_UNCERTAIN");
    expect(text).not.toContain("secret provider detail");
  });
});

describe("durable ingestion status and result reconciliation", () => {
  const status = (targetId: string) =>
    ingestionRoute.GET(
      request(`/api/analysis-targets/${targetId}/ingestion`, "GET"),
      ctx(targetId) as never,
    );
  const refresh = (targetId: string, body?: unknown) =>
    ingestionRefreshRoute.POST(
      request(`/api/analysis-targets/${targetId}/ingestion/refresh`, "POST", body),
      ctx(targetId) as never,
    );

  it("confirms no attempt through an owner-scoped backend read", async () => {
    signInAs(USER_A);
    useDatabase();
    const result = await status(TARGET_A);
    expect(result.status).toBe(200);
    expect((await result.json()).data.state).toBe("not_ingested");
    expect(startOutscraperExtraction).not.toHaveBeenCalled();
  });
  it("reuses a processing attempt and starts only one paid job", async () => {
    signInAs(USER_A);
    const db = useDatabase();
    await Promise.all([postIngestion(TARGET_A), postIngestion(TARGET_A)]);
    expect(startOutscraperExtraction).toHaveBeenCalledTimes(1);
    expect(db.tables.ingestion_attempts).toHaveLength(1);
    expect((await (await status(TARGET_A)).json()).data.state).toBe("processing");
  });
  it("ignores browser job IDs and completes only a server-bound verified result", async () => {
    signInAs(USER_A);
    const db = useDatabase();
    await postIngestion(TARGET_A);
    jest.mocked(getExtractedReviews).mockResolvedValue({
      status: "completed",
      placeId: PLACE_ID_A,
      businessName: "Synthetic",
      identity: { placeId: PLACE_ID_A, businessName: "Synthetic" },
      reviews: [
        {
          text: "New synthetic review",
          rating: 5,
          sourceReviewId: undefined,
          reviewerName: undefined,
          reviewDate: undefined,
          reviewUrl: undefined,
          metadata: {
            platform: "google_maps",
            provider: "outscraper",
            placeId: PLACE_ID_A,
            googleId: undefined,
          },
        },
      ],
    });
    const result = await refresh(TARGET_A, {
      requestId: "stolen-job",
      ownerId: USER_B.id,
      reviews: [{ text: "fabricated" }],
    });
    expect(result.status).toBe(200);
    expect((await result.json()).data).toMatchObject({ state: "succeeded", savedCount: 1 });
    expect(getExtractedReviews).toHaveBeenCalledWith("job-1", {
      sourceUrl: "https://www.google.com/maps/place/Example",
      googlePlaceId: PLACE_ID_A,
    });
    await refresh(TARGET_A);
    expect(getExtractedReviews).toHaveBeenCalledTimes(1);
    expect(db.tables.reviews).toHaveLength(2);
  });
  it("completes a source-only target and reports provider identity without promoting its Place ID", async () => {
    signInAs(USER_A);
    const db = useDatabase();
    await postIngestion(TARGET_A_NO_SOURCE);
    jest.mocked(getExtractedReviews).mockResolvedValue({
      status: "completed",
      placeId: PLACE_ID_A,
      businessName: "Provider business",
      identity: { placeId: PLACE_ID_A, businessName: "Provider business" },
      reviews: [
        {
          text: "Synthetic URL review",
          rating: 4,
          sourceReviewId: undefined,
          reviewerName: undefined,
          reviewDate: undefined,
          reviewUrl: undefined,
          metadata: {
            platform: "google_maps",
            provider: "outscraper",
            placeId: PLACE_ID_A,
            googleId: undefined,
          },
        },
      ],
    });
    const result = await refresh(TARGET_A_NO_SOURCE, { requestId: "forged" });
    expect((await result.json()).data).toMatchObject({
      state: "succeeded",
      savedCount: 1,
      identityBasis: "provider_resolved",
      providerBusinessName: "Provider business",
    });
    expect(
      db.tables.analysis_targets.find((row) => row.id === TARGET_A_NO_SOURCE)?.google_place_id,
    ).toBeNull();
    expect(getExtractedReviews).toHaveBeenCalledWith("job-1", {
      sourceUrl: "https://www.google.com/maps/place/Example",
      googlePlaceId: null,
    });
  });
  it.each(["status", "refresh"])(
    "denies User B at the backend %s boundary without reading jobs",
    async (operation) => {
      signInAs(USER_B);
      const db = useDatabase();
      await expectNotFound(
        await (operation === "status"
          ? status(TARGET_A)
          : refresh(TARGET_A, { requestId: "job-1", ownerId: USER_A.id })),
      );
      expect(db.tablesTouched()).not.toContain("ingestion_attempts");
      expect(db.tablesTouched()).not.toContain("latest_ingestion_attempts");
      expect(getExtractedReviews).not.toHaveBeenCalled();
    },
  );
  it.each(["status", "refresh"])(
    "rejects anonymous %s requests before creating a client",
    async (operation) => {
      signInAs(null);
      useDatabase();
      expect((await (operation === "status" ? status(TARGET_A) : refresh(TARGET_A))).status).toBe(
        401,
      );
      expect(createSupabaseServerClient).not.toHaveBeenCalled();
    },
  );
  it("keeps paid ingestion off unless explicitly enabled", async () => {
    signInAs(USER_A);
    useDatabase();
    delete process.env.INGESTION_ENABLED;
    const result = await postIngestion(TARGET_A);
    expect(result.status).toBe(503);
    expect(startOutscraperExtraction).not.toHaveBeenCalled();
    expect(createIngestionAdminClient).not.toHaveBeenCalled();
  });
  it("also disables refresh before any provider or privileged work", async () => {
    signInAs(USER_A);
    useDatabase();
    delete process.env.INGESTION_ENABLED;
    const result = await refresh(TARGET_A);
    expect(result.status).toBe(503);
    expect((await result.json()).error.code).toBe("INGESTION_DISABLED");
    expect(getExtractedReviews).not.toHaveBeenCalled();
    expect(createIngestionAdminClient).not.toHaveBeenCalled();
    expect(createSupabaseServerClient).not.toHaveBeenCalled();
  });
  it("requires both storage approval and its evidence reference", async () => {
    signInAs(USER_A);
    useDatabase();
    delete process.env.PROVIDER_REVIEW_STORAGE_APPROVAL_REFERENCE;
    const result = await postIngestion(TARGET_A);
    expect(result.status).toBe(503);
    expect((await result.json()).error.code).toBe("STORAGE_NOT_APPROVED");
    expect(startOutscraperExtraction).not.toHaveBeenCalled();
  });
  it("requires recovery configuration before any paid provider request", async () => {
    signInAs(USER_A);
    useDatabase();
    delete process.env.INGESTION_CALLBACK_SECRET;
    const result = await postIngestion(TARGET_A);
    expect(result.status).toBe(503);
    expect((await result.json()).error.code).toBe("RECOVERY_NOT_CONFIGURED");
    expect(startOutscraperExtraction).not.toHaveBeenCalled();
  });
});

describe("review modification", () => {
  // Next answers 405 for any method a route module does not export. The reviews table also has no
  // UPDATE or DELETE grant (see tests/db/cross-user-review-authorization.test.sql).
  it.each(["PUT", "PATCH", "DELETE"])(
    "exposes no %s handler for reviews or ingestion",
    (method) => {
      expect(reviewsRoute).not.toHaveProperty(method);
      expect(ingestionRoute).not.toHaveProperty(method);
    },
  );
});
