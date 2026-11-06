/** @jest-environment node */
// S1-013: cross-user authorization for the AnalysisTarget child routes (reviews and ingestion).
// The real auth guard, ownership helper, repository, review service, and normalizer run. Only the
// Supabase client (an in-memory fake), the session lookup, and the review provider are replaced,
// so nothing here calls a live service.
import { NextRequest } from "next/server";

import * as ingestionRoute from "@/app/api/analysis-targets/[targetId]/ingestion/route";
import * as reviewsRoute from "@/app/api/analysis-targets/[targetId]/reviews/route";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAuthenticatedUser } from "@/services/auth/auth-service";
import {
  getOutscraperResult,
  startOutscraperExtraction,
} from "@/services/ingestion/outscraper-client";
import { getExtractedReviews } from "@/services/ingestion/outscraper-service";
import { normalizeBatch } from "@/services/reviews/normalize";

jest.mock("@/services/auth/auth-service", () => ({ getAuthenticatedUser: jest.fn() }));
jest.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: jest.fn() }));
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
      let rows = tables[table].filter((row) => filters.every(([col, val]) => row[col] === val));
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

describe("POST /api/analysis-targets/[targetId]/ingestion", () => {
  it("lets User A start ingestion for their own target", async () => {
    signInAs(USER_A);
    useDatabase();

    const response = await postIngestion(TARGET_A);

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({
      success: true,
      data: {
        status: "accepted",
        targetId: TARGET_A,
        requestId: "job-1",
        providerStatus: "Pending",
      },
    });
    expect(startOutscraperExtraction).toHaveBeenCalledTimes(1);
    expect(startOutscraperExtraction).toHaveBeenCalledWith(PLACE_ID_A);
  });

  it("returns 409 for an owned target with no review source, without calling the provider", async () => {
    signInAs(USER_A);
    useDatabase();

    const response = await postIngestion(TARGET_A_NO_SOURCE);

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "SOURCE_NOT_CONFIGURED" },
    });
    expect(startOutscraperExtraction).not.toHaveBeenCalled();
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

  it("returns a generic 500 without provider details when the provider fails", async () => {
    signInAs(USER_A);
    useDatabase();
    jest.mocked(startOutscraperExtraction).mockRejectedValue(new Error("secret provider detail"));

    const response = await postIngestion(TARGET_A);

    expect(response.status).toBe(500);
    const text = await response.text();
    expect(text).toContain("INGESTION_START_FAILED");
    expect(text).not.toContain("secret provider detail");
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
