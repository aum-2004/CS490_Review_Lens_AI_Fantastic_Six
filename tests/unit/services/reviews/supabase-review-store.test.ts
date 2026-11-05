/** @jest-environment node */

import type { SupabaseClient } from "@supabase/supabase-js";

import { ReviewPersistenceError } from "@/services/reviews/errors";
import { createSupabaseReviewStore } from "@/services/reviews/supabase-review-store";

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

// Records each builder call; awaiting the builder (or maybeSingle) returns the next result.
function createFakeClient(...results: QueryResult[]) {
  const calls: Array<[string, ...unknown[]]> = [];
  const next = async () => results.shift() ?? { data: null, error: null };
  const builder: Record<string, unknown> = {
    then: (resolve: (value: QueryResult) => unknown, reject: (reason: unknown) => unknown) =>
      next().then(resolve, reject),
    maybeSingle: async () => (calls.push(["maybeSingle"]), next()),
  };
  for (const method of ["insert", "select", "eq", "order"]) {
    builder[method] = (...args: unknown[]) => (calls.push([method, ...args]), builder);
  }
  const client = { from: (table: string) => (calls.push(["from", table]), builder) };

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

  test("inserts the batch in one statement with the target id and mapped columns", async () => {
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
      ["from", "reviews"],
      [
        "insert",
        [
          {
            analysis_target_id: TARGET_ID,
            review_text: "Great food",
            rating: 4.5,
            source_review_id: "src-1",
            reviewer_name: "Sam",
            review_date: "2026-10-01T12:00:00.000Z",
            review_url: "https://maps.google.com/review/1",
            source_metadata: { helpfulVotes: 3 },
          },
          {
            analysis_target_id: TARGET_ID,
            review_text: "Slow",
            rating: 2,
            source_review_id: null,
            reviewer_name: null,
            review_date: null,
            review_url: null,
            source_metadata: null,
          },
        ],
      ],
      ["select", COLUMNS],
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

  test("lists one target's reviews in a stable order", async () => {
    const { client, calls } = createFakeClient({ data: [storedRow], error: null });

    const reviews = await createSupabaseReviewStore(client).listReviews(TARGET_ID);

    expect(reviews.map((review) => review.text)).toEqual(["Great food"]);
    expect(calls).toEqual([
      ["from", "reviews"],
      ["select", COLUMNS],
      ["eq", "analysis_target_id", TARGET_ID],
      ["order", "created_at", { ascending: true }],
      ["order", "id", { ascending: true }],
    ]);
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
