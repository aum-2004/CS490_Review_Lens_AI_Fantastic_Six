/** @jest-environment node */

import { InvalidReviewError, TargetNotFoundError } from "@/services/reviews/errors";
import { normalizeBatch } from "@/services/reviews/normalize";
import {
  getReviewsForTarget,
  MAX_METADATA_BYTES,
  sanitizeMetadata,
  saveReviews,
  type Review,
  type ReviewStore,
} from "@/services/reviews/review-service";
import type { NormalizedReview } from "@/services/reviews/types";

// Mirrors the Supabase store: rows are keyed by target, and ownership lives on the target.
function createInMemoryStore(targetOwners: Record<string, string>) {
  const rows: Review[] = [];
  const inserted: NormalizedReview[][] = [];
  let nextId = 1;

  const store: ReviewStore = {
    async isTargetOwnedBy(targetId, userId) {
      return targetOwners[targetId] === userId;
    },
    async insertReviews(targetId, reviews) {
      inserted.push(reviews);
      const created = reviews.map((review) => ({
        id: `review-${nextId++}`,
        analysisTargetId: targetId,
        text: review.text,
        rating: review.rating,
        sourceReviewId: review.sourceReviewId ?? null,
        reviewerName: review.reviewerName ?? null,
        reviewDate: review.reviewDate?.toISOString() ?? null,
        reviewUrl: review.reviewUrl ?? null,
        sourceMetadata: review.sourceMetadata ?? null,
        createdAt: new Date().toISOString(),
      }));
      rows.push(...created);

      return created;
    },
    async listReviews(targetId) {
      return rows.filter((row) => row.analysisTargetId === targetId);
    },
  };

  return { store, inserted };
}

const userA = "user-a";
const userB = "user-b";
const reviewsA: NormalizedReview[] = [
  {
    text: "Great food",
    rating: 5,
    sourceReviewId: "src-1",
    reviewerName: "Sam",
    reviewDate: new Date("2026-10-01T12:00:00Z"),
    reviewUrl: "https://maps.google.com/review/1",
    sourceMetadata: { helpfulVotes: 3 },
  },
  { text: "Slow service", rating: 2 },
];
const reviewsB: NormalizedReview[] = [{ text: "Fine", rating: 3 }];

describe("review persistence (S1-022)", () => {
  let store: ReviewStore;
  let inserted: NormalizedReview[][];

  beforeEach(() => {
    ({ store, inserted } = createInMemoryStore({
      "target-a": userA,
      "target-b": userB,
      "target-a2": userA,
    }));
  });

  test("persists reviews after successful ingestion and they can be retrieved", async () => {
    const saved = await saveReviews(store, userA, "target-a", reviewsA);
    const retrieved = await getReviewsForTarget(store, userA, "target-a");

    expect(saved).toHaveLength(2);
    expect(retrieved).toEqual(saved);
  });

  test("persisted text, rating and optional fields match normalized input", async () => {
    await saveReviews(store, userA, "target-a", reviewsA);
    const retrieved = await getReviewsForTarget(store, userA, "target-a");

    expect(retrieved.map((r) => [r.text, r.rating])).toEqual([
      ["Great food", 5],
      ["Slow service", 2],
    ]);
    expect(retrieved[0]).toMatchObject({
      sourceReviewId: "src-1",
      reviewerName: "Sam",
      reviewDate: "2026-10-01T12:00:00.000Z",
      reviewUrl: "https://maps.google.com/review/1",
      sourceMetadata: { helpfulVotes: 3 },
    });
    expect(retrieved[1]).toMatchObject({ sourceReviewId: null, reviewDate: null });
  });

  test("accepts S1-021 normalizeBatch output unchanged", async () => {
    const { reviews } = normalizeBatch([
      { text: " Lovely ", rating: "4.5", reviewDate: "2026-10-02", sourceReviewId: 42 },
      { text: "", rating: 5 },
    ]);

    const saved = await saveReviews(store, userA, "target-a", reviews);

    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({
      text: "Lovely",
      rating: 4.5,
      sourceReviewId: "42",
      reviewDate: "2026-10-02T00:00:00.000Z",
    });
  });

  test("reviews are associated with the intended target", async () => {
    const saved = await saveReviews(store, userA, "target-a", reviewsA);

    expect(saved.every((review) => review.analysisTargetId === "target-a")).toBe(true);
  });

  test("reviews from target A do not appear when retrieving target B", async () => {
    await saveReviews(store, userA, "target-a", reviewsA);
    await saveReviews(store, userB, "target-b", reviewsB);

    const forB = await getReviewsForTarget(store, userB, "target-b");
    const forA2 = await getReviewsForTarget(store, userA, "target-a2");

    expect(forB.map((r) => r.text)).toEqual(["Fine"]);
    expect(forA2).toEqual([]);
  });

  test("a user cannot retrieve reviews through another user's target", async () => {
    await saveReviews(store, userA, "target-a", reviewsA);

    await expect(getReviewsForTarget(store, userB, "target-a")).rejects.toBeInstanceOf(
      TargetNotFoundError,
    );
  });

  test("a user cannot save reviews under another user's target", async () => {
    await expect(saveReviews(store, userB, "target-a", reviewsB)).rejects.toBeInstanceOf(
      TargetNotFoundError,
    );
    expect(inserted).toEqual([]);
  });

  test("a nonexistent target is indistinguishable from another user's target", async () => {
    await expect(saveReviews(store, userA, "missing", reviewsB)).rejects.toBeInstanceOf(
      TargetNotFoundError,
    );
  });

  test("an empty batch saves nothing", async () => {
    expect(await saveReviews(store, userA, "target-a", [])).toEqual([]);
    expect(inserted).toEqual([]);
  });

  test("duplicate source review ids are stored as-is in Sprint 1", async () => {
    const duplicate = { text: "Again", rating: 4, sourceReviewId: "src-1" };

    const saved = await saveReviews(store, userA, "target-a", [duplicate, duplicate]);

    expect(saved.map((r) => r.sourceReviewId)).toEqual(["src-1", "src-1"]);
  });

  test.each<[string, NormalizedReview]>([
    ["blank text", { text: "  ", rating: 4 }],
    ["NaN rating", { text: "ok", rating: Number.NaN }],
    ["rating below 1", { text: "ok", rating: 0 }],
    ["rating above 5", { text: "ok", rating: 6 }],
    ["invalid date", { text: "ok", rating: 4, reviewDate: new Date("nope") }],
  ])("rejects a batch with %s without persisting any of it", async (_label, bad) => {
    await expect(saveReviews(store, userA, "target-a", [...reviewsA, bad])).rejects.toBeInstanceOf(
      InvalidReviewError,
    );
    expect(inserted).toEqual([]);
  });

  test("sanitizes metadata before it reaches the store", async () => {
    await saveReviews(store, userA, "target-a", [
      { text: "ok", rating: 4, sourceMetadata: { "no\u0000te": "a\u0000b" } },
    ]);

    expect(inserted[0][0].sourceMetadata).toEqual({ note: "ab" });
  });

  test("saves a whole batch in full when one review has malformed characters", async () => {
    const { reviews, rejected } = normalizeBatch([
      { text: "Fine", rating: 3 },
      {
        text: "Cut off \ud83d",
        rating: 4,
        reviewerName: "Sam\u0000",
        metadata: { "ke\ud83dy": ["ok", { deep: "bad\ude00\u0000" }] },
      },
      { text: "Emoji 😀", rating: 5 },
    ]);

    const saved = await saveReviews(store, userA, "target-a", reviews);

    expect(rejected).toEqual([]);
    expect(saved).toHaveLength(3);
    // Postgres rejects NUL and lone surrogates, so nothing like that may reach the store.
    expect(unstorableStrings(inserted[0])).toEqual([]);
    expect(saved.map((review) => review.text)).toEqual(["Fine", "Cut off �", "Emoji 😀"]);
    expect(inserted[0][1].sourceMetadata).toEqual({ "ke�y": ["ok", { deep: "bad�" }] });
  });
});

// Every string (and object key) anywhere in `value` that Postgres would reject.
function unstorableStrings(value: unknown): string[] {
  if (typeof value === "string") {
    return value.isWellFormed() && !value.includes("\u0000") ? [] : [value];
  }
  if (Array.isArray(value)) return value.flatMap(unstorableStrings);
  if (value instanceof Date || value === null || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, item]) => [
    ...unstorableStrings(key),
    ...unstorableStrings(item),
  ]);
}

describe("sanitizeMetadata", () => {
  test("removes NUL characters from nested keys and strings", () => {
    expect(sanitizeMetadata({ a: { "b\u0000": ["x\u0000", 1] } })).toEqual({ a: { b: ["x", 1] } });
  });

  test("replaces lone surrogates in nested keys and strings and keeps valid emoji", () => {
    expect(
      sanitizeMetadata({
        "ti\ud83dtle": "ok 😀",
        nested: { list: ["cut \ud83d", { "\ude00": "x" }] },
      }),
    ).toEqual({
      "ti�tle": "ok 😀",
      nested: { list: ["cut �", { "�": "x" }] },
    });
  });

  test("drops values JSON cannot represent and keeps the rest", () => {
    expect(
      sanitizeMetadata({
        keep: true,
        when: new Date("2026-10-01T00:00:00Z"),
        nan: Number.NaN,
        fn: () => 1,
        big: BigInt(1),
        map: new Map(),
        list: [undefined, 2],
      }),
    ).toEqual({ keep: true, when: "2026-10-01T00:00:00.000Z", list: [null, 2] });
  });

  test("stops at the depth limit, so cyclic metadata does not loop forever", () => {
    const cyclic: Record<string, unknown> = { name: "loop" };
    cyclic.self = cyclic;

    const clean = sanitizeMetadata(cyclic);

    expect(clean).toMatchObject({ name: "loop", self: { name: "loop" } });
    expect(() => JSON.stringify(clean)).not.toThrow();
  });

  test("drops metadata larger than the size limit", () => {
    expect(sanitizeMetadata({ blob: "x".repeat(MAX_METADATA_BYTES) })).toBeUndefined();
    expect(sanitizeMetadata({ blob: "x".repeat(100) })).toEqual({ blob: "x".repeat(100) });
  });

  test("returns undefined for missing or non-object metadata", () => {
    expect(sanitizeMetadata(undefined)).toBeUndefined();
    expect(sanitizeMetadata(["a"])).toBeUndefined();
    expect(sanitizeMetadata("text")).toBeUndefined();
  });
});
