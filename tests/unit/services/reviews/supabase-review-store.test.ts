/** @jest-environment node */

import type { SupabaseClient } from "@supabase/supabase-js";

import { ReviewPersistenceError } from "@/services/reviews/errors";
import {
  createSupabaseReviewStore,
  REVIEW_PAGE_SIZE,
} from "@/services/reviews/supabase-review-store";

const USER_A = "11111111-1111-4111-8111-111111111111";
const TARGET_ID = "33333333-3333-4333-8333-333333333333";
const COLUMNS =
  "id, analysis_target_id, review_text, rating, source_review_id, reviewer_name, review_date, " +
  "review_url, source_metadata, created_at";

const storedRow = {
  id: "44444444-4444-4444-8444-444444444444",
  analysis_target_id: TARGET_ID,
  review_text: "Great food",
  rating: "4.5",
  source_review_id: "src-1",
  reviewer_name: "Sam",
  review_date: "2026-10-01T12:00:00+00:00",
  review_url: "https://maps.google.com/review/1",
  source_metadata: { helpfulVotes: 3 },
  created_at: "2026-11-04T12:00:00+00:00",
};

type QueryResult = { data: unknown; error: unknown };

// Deterministic stored rows in (created_at, id) order, starting at `start`.
function rowsFrom(start: number, count: number) {
  return Array.from({ length: count }, (_, offset) => {
    const n = start + offset;
    return {
      ...storedRow,
      id: `review-${String(n).padStart(5, "0")}`,
      review_text: `Review ${n}`,
      created_at: new Date(Date.UTC(2026, 10, 4) + n * 1000).toISOString(),
    };
  });
}

const page = (rows: unknown[]): QueryResult => ({ data: rows, error: null });
const listQuery = (from: number, to: number) => [
  ["from", "reviews"],
  ["select", COLUMNS],
  ["eq", "analysis_target_id", TARGET_ID],
  ["order", "created_at", { ascending: true }],
  ["order", "id", { ascending: true }],
  ["range", from, to],
];

// Records each builder call; awaiting the builder (or maybeSingle) returns the next result.
function createFakeClient(...results: QueryResult[]) {
  const calls: Array<[string, ...unknown[]]> = [];
  const next = async () => results.shift() ?? { data: null, error: null };
  const builder: Record<string, unknown> = {
    then: (resolve: (value: QueryResult) => unknown, reject: (reason: unknown) => unknown) =>
      next().then(resolve, reject),
    maybeSingle: async () => (calls.push(["maybeSingle"]), next()),
  };
  for (const method of ["insert", "select", "eq", "order", "range"]) {
    builder[method] = (...args: unknown[]) => (calls.push([method, ...args]), builder);
  }
  const client = {
    from: (table: string) => (calls.push(["from", table]), builder),
    rpc: (name: string, args: unknown) => (calls.push(["rpc", name, args]), next()),
  };

  return { client: client as unknown as SupabaseClient, calls };
}

describe("createSupabaseReviewStore", () => {
  test("checks target ownership through the S1-014 repository", async () => {
    const { client, calls } = createFakeClient({
      data: { id: TARGET_ID, owner_id: USER_A },
      error: null,
    });

    await expect(
      createSupabaseReviewStore(client).isTargetOwnedBy(TARGET_ID, USER_A),
    ).resolves.toBe(true);
    expect(calls).toContainEqual(["eq", "owner_id", USER_A]);
  });

  test("treats a non-UUID target id as not owned without querying", async () => {
    const { client, calls } = createFakeClient();

    await expect(createSupabaseReviewStore(client).isTargetOwnedBy("abc", USER_A)).resolves.toBe(
      false,
    );
    expect(calls).toEqual([]);
  });

  test("treats a target the user cannot see as not owned", async () => {
    const { client } = createFakeClient({ data: null, error: null });

    await expect(
      createSupabaseReviewStore(client).isTargetOwnedBy(TARGET_ID, USER_A),
    ).resolves.toBe(false);
  });

  test("inserts the batch through the user-scoped atomic RPC", async () => {
    const { client, calls } = createFakeClient({ data: [storedRow], error: null });

    const saved = await createSupabaseReviewStore(client).insertReviews(TARGET_ID, [
      {
        text: "Great food",
        rating: 4.5,
        sourceReviewId: "src-1",
        reviewerName: "Sam",
        reviewDate: new Date("2026-10-01T12:00:00Z"),
        reviewUrl: "https://maps.google.com/review/1",
        sourceMetadata: { helpfulVotes: 3 },
      },
      { text: "Slow", rating: 2 },
    ]);

    expect(calls).toEqual([
      [
        "rpc",
        "insert_reviews",
        {
          p_target_id: TARGET_ID,
          p_rows: [
            {
              review_text: "Great food",
              rating: 4.5,
              source_review_id: "src-1",
              reviewer_name: "Sam",
              review_date: "2026-10-01T12:00:00.000Z",
              review_url: "https://maps.google.com/review/1",
              source_metadata: { helpfulVotes: 3 },
            },
            {
              review_text: "Slow",
              rating: 2,
              source_review_id: null,
              reviewer_name: null,
              review_date: null,
              review_url: null,
              source_metadata: null,
            },
          ],
        },
      ],
    ]);
    expect(saved).toEqual([
      {
        id: storedRow.id,
        analysisTargetId: TARGET_ID,
        text: "Great food",
        rating: 4.5,
        sourceReviewId: "src-1",
        reviewerName: "Sam",
        reviewDate: "2026-10-01T12:00:00+00:00",
        reviewUrl: "https://maps.google.com/review/1",
        sourceMetadata: { helpfulVotes: 3 },
        createdAt: "2026-11-04T12:00:00+00:00",
      },
    ]);
  });

  test("aggregates through RPC without selecting review columns", async () => {
    const { client, calls } = createFakeClient({
      data: [{ review_count: "1001", average_rating: "3.25" }],
      error: null,
    });

    await expect(createSupabaseReviewStore(client).aggregateReviews(TARGET_ID)).resolves.toEqual({
      reviewCount: 1001,
      averageRating: 3.25,
    });
    expect(calls).toEqual([["rpc", "get_review_summary", { p_target_id: TARGET_ID }]]);
  });

  test("preserves an empty aggregate as zero reviews and a null average", async () => {
    const { client } = createFakeClient({
      data: [{ review_count: "0", average_rating: null }],
      error: null,
    });

    await expect(createSupabaseReviewStore(client).aggregateReviews(TARGET_ID)).resolves.toEqual({
      reviewCount: 0,
      averageRating: null,
    });
  });

  test("wraps aggregate failures without exposing database details", async () => {
    const dbError = { message: 'function "get_review_summary" does not exist' };
    const { client } = createFakeClient({ data: null, error: dbError });

    await expect(
      createSupabaseReviewStore(client).aggregateReviews(TARGET_ID),
    ).rejects.toMatchObject({
      name: "ReviewPersistenceError",
      message: expect.not.stringContaining("get_review_summary"),
      cause: dbError,
    });
  });

  test.each([
    { review_count: "-1", average_rating: "3" },
    { review_count: "not-a-number", average_rating: "3" },
    { review_count: "1", average_rating: "not-a-number" },
  ])("rejects malformed aggregate data: %j", async (data) => {
    const { client } = createFakeClient({ data: [data], error: null });

    await expect(
      createSupabaseReviewStore(client).aggregateReviews(TARGET_ID),
    ).rejects.toBeInstanceOf(ReviewPersistenceError);
  });

  test("lists one target's reviews in a stable order, stopping at an empty page", async () => {
    const { client, calls } = createFakeClient(page([storedRow]), page([]));

    const reviews = await createSupabaseReviewStore(client).listReviews(TARGET_ID);

    expect(reviews.map((review) => review.text)).toEqual(["Great food"]);
    expect(calls).toEqual([
      ...listQuery(0, REVIEW_PAGE_SIZE - 1),
      ...listQuery(1, REVIEW_PAGE_SIZE),
    ]);
  });

  test("returns an empty list for a target with no reviews", async () => {
    const { client, calls } = createFakeClient(page([]));

    await expect(createSupabaseReviewStore(client).listReviews(TARGET_ID)).resolves.toEqual([]);
    expect(calls).toEqual(listQuery(0, REVIEW_PAGE_SIZE - 1));
  });

  test("retrieves every review across pages instead of truncating at the API row limit", async () => {
    const { client, calls } = createFakeClient(
      page(rowsFrom(0, REVIEW_PAGE_SIZE)),
      page(rowsFrom(REVIEW_PAGE_SIZE, 1)),
      page([]),
    );

    const reviews = await createSupabaseReviewStore(client).listReviews(TARGET_ID);

    expect(reviews).toHaveLength(REVIEW_PAGE_SIZE + 1);
    expect(reviews.map((review) => review.id)).toEqual(
      rowsFrom(0, REVIEW_PAGE_SIZE + 1).map((row) => row.id),
    );
    // Every page keeps the target filter and the stable (created_at, id) order.
    expect(calls).toEqual([
      ...listQuery(0, REVIEW_PAGE_SIZE - 1),
      ...listQuery(REVIEW_PAGE_SIZE, 2 * REVIEW_PAGE_SIZE - 1),
      ...listQuery(REVIEW_PAGE_SIZE + 1, 2 * REVIEW_PAGE_SIZE),
    ]);
  });

  test("still retrieves every review when the server caps pages below the page size", async () => {
    const serverCap = 400;
    const { client, calls } = createFakeClient(
      page(rowsFrom(0, serverCap)),
      page(rowsFrom(serverCap, serverCap)),
      page(rowsFrom(2 * serverCap, 201)),
      page([]),
    );

    const reviews = await createSupabaseReviewStore(client).listReviews(TARGET_ID);

    expect(reviews.map((review) => review.id)).toEqual(
      rowsFrom(0, 2 * serverCap + 201).map((row) => row.id),
    );
    expect(calls.filter(([method]) => method === "range")).toEqual([
      ["range", 0, REVIEW_PAGE_SIZE - 1],
      ["range", serverCap, serverCap + REVIEW_PAGE_SIZE - 1],
      ["range", 2 * serverCap, 2 * serverCap + REVIEW_PAGE_SIZE - 1],
      ["range", 2 * serverCap + 201, 2 * serverCap + 201 + REVIEW_PAGE_SIZE - 1],
    ]);
  });

  test("fails the whole read when a later page fails, never returning a partial result", async () => {
    const dbError = { message: "canceling statement due to statement timeout" };
    const { client, calls } = createFakeClient(page(rowsFrom(0, REVIEW_PAGE_SIZE)), {
      data: null,
      error: dbError,
    });

    await expect(createSupabaseReviewStore(client).listReviews(TARGET_ID)).rejects.toMatchObject({
      name: "ReviewPersistenceError",
      message: expect.not.stringContaining("timeout"),
      cause: dbError,
    });
    expect(calls.filter(([method]) => method === "range")).toHaveLength(2);
  });

  test.each(["insertReviews", "listReviews"] as const)(
    "%s wraps database errors without exposing details",
    async (method) => {
      const dbError = { message: 'relation "reviews" does not exist' };
      const { client } = createFakeClient({ data: null, error: dbError });
      const store = createSupabaseReviewStore(client);

      const call =
        method === "insertReviews"
          ? store.insertReviews(TARGET_ID, [{ text: "ok", rating: 4 }])
          : store.listReviews(TARGET_ID);

      await expect(call).rejects.toMatchObject({
        name: "ReviewPersistenceError",
        message: expect.not.stringContaining("relation"),
        cause: dbError,
      });
      await expect(call).rejects.toBeInstanceOf(ReviewPersistenceError);
    },
  );
});
