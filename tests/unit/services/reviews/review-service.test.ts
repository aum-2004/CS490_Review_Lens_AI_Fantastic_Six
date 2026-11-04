import {
  getReviewsForTarget,
  saveReviews,
  type ReviewStore,
} from "@/services/reviews/review-service";
import { InvalidReviewError, TargetNotFoundError } from "@/services/reviews/errors";
import type { NormalizedReview, Review } from "@/types/review";

function createInMemoryStore(targetOwners: Record<string, string>): ReviewStore {
  const rows: Review[] = [];
  let nextId = 1;

  return {
    async getTargetOwnerId(targetId) {
      return targetOwners[targetId] ?? null;
    },
    async insertReviews(targetId, reviews) {
      const created = reviews.map((review) => ({
        ...review,
        id: `review-${nextId++}`,
        analysisTargetId: targetId,
        createdAt: new Date().toISOString(),
      }));
      rows.push(...created);

      return created;
    },
    async listReviews(targetId) {
      return rows.filter((row) => row.analysisTargetId === targetId);
    },
  };
}

const userA = "user-a";
const userB = "user-b";
const reviewsA: NormalizedReview[] = [
  { reviewText: "Great food", rating: 5, sourceReviewId: "src-1", reviewerName: "Sam" },
  { reviewText: "Slow service", rating: 2 },
];
const reviewsB: NormalizedReview[] = [{ reviewText: "Fine", rating: 3 }];

describe("review persistence (S1-022)", () => {
  let store: ReviewStore;

  beforeEach(() => {
    store = createInMemoryStore({ "target-a": userA, "target-b": userB, "target-a2": userA });
  });

  test("persists reviews after successful ingestion and they can be retrieved", async () => {
    const saved = await saveReviews(store, userA, "target-a", reviewsA);
    const retrieved = await getReviewsForTarget(store, userA, "target-a");

    expect(saved).toHaveLength(2);
    expect(retrieved).toHaveLength(2);
    expect(retrieved.every((review) => review.id)).toBe(true);
  });

  test("persisted text and rating match normalized input", async () => {
    await saveReviews(store, userA, "target-a", reviewsA);
    const retrieved = await getReviewsForTarget(store, userA, "target-a");

    expect(retrieved.map((r) => [r.reviewText, r.rating])).toEqual([
      ["Great food", 5],
      ["Slow service", 2],
    ]);
    expect(retrieved[0].sourceReviewId).toBe("src-1");
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

    expect(forB.map((r) => r.reviewText)).toEqual(["Fine"]);
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
    expect(await getReviewsForTarget(store, userA, "target-a")).toEqual([]);
  });

  test("a nonexistent target is indistinguishable from another user's target", async () => {
    await expect(saveReviews(store, userA, "missing", reviewsB)).rejects.toBeInstanceOf(
      TargetNotFoundError,
    );
  });

  test("rejects an invalid batch without persisting any of it", async () => {
    const bad = [...reviewsA, { reviewText: "  ", rating: 4 }];

    await expect(saveReviews(store, userA, "target-a", bad)).rejects.toBeInstanceOf(
      InvalidReviewError,
    );
    expect(await getReviewsForTarget(store, userA, "target-a")).toEqual([]);
  });

  test("rejects a non-numeric rating", async () => {
    await expect(
      saveReviews(store, userA, "target-a", [{ reviewText: "ok", rating: Number.NaN }]),
    ).rejects.toBeInstanceOf(InvalidReviewError);
  });
});
