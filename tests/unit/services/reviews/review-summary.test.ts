/** @jest-environment node */

import { getReviewSummary } from "@/services/reviews/review-summary";
import { TargetNotFoundError } from "@/services/reviews/errors";
import type { Review, ReviewStore } from "@/services/reviews/review-service";

function review(id: string, targetId: string, rating: number): Review {
  return {
    id,
    analysisTargetId: targetId,
    text: `Review ${id}`,
    rating,
    sourceReviewId: null,
    reviewerName: null,
    reviewDate: null,
    reviewUrl: null,
    sourceMetadata: null,
    createdAt: "2026-11-10T00:00:00Z",
  };
}

function database(attempt: Record<string, unknown> | null, error: unknown = null) {
  const query = {
    select: () => query,
    eq: () => query,
    maybeSingle: async () => ({ data: attempt, error }),
  };
  return { from: jest.fn(() => query) } as never;
}

function storeFor(targetOwners: Record<string, string>, rows: Review[]): ReviewStore {
  return {
    isTargetOwnedBy: async (targetId, userId) => targetOwners[targetId] === userId,
    insertReviews: jest.fn(),
    listReviews: async (targetId) => rows.filter((row) => row.analysisTargetId === targetId),
  };
}

const userA = "user-a";
const userB = "user-b";
const targetA = "target-a";
const targetB = "target-b";

describe("getReviewSummary", () => {
  it("counts persisted reviews, averages their ratings, and includes ingestion details", async () => {
    const result = await getReviewSummary(
      storeFor({ [targetA]: userA }, [review("a1", targetA, 5), review("a2", targetA, 3)]),
      database({ status: "succeeded", skipped_count: 2 }),
      userA,
      targetA,
    );

    expect(result).toEqual({
      targetId: targetA,
      reviewCount: 2,
      averageRating: 4,
      ingestionStatus: "succeeded",
      skippedCount: 2,
    });
  });

  it("returns a null average for an empty persisted dataset", async () => {
    await expect(
      getReviewSummary(storeFor({ [targetA]: userA }, []), database(null), userA, targetA),
    ).resolves.toMatchObject({
      targetId: targetA,
      reviewCount: 0,
      averageRating: null,
      ingestionStatus: null,
      skippedCount: null,
    });
  });

  it("only summarizes the selected target", async () => {
    const result = await getReviewSummary(
      storeFor({ [targetA]: userA, [targetB]: userA }, [
        review("a1", targetA, 5),
        review("b1", targetB, 1),
        review("b2", targetB, 3),
      ]),
      database({ status: "failed", skipped_count: 1 }),
      userA,
      targetB,
    );

    expect(result).toMatchObject({ targetId: targetB, reviewCount: 2, averageRating: 2 });
  });

  it("rejects unauthorized access before reading reviews or ingestion records", async () => {
    const store = storeFor({ [targetA]: userA }, [review("a1", targetA, 5)]);
    const listReviews = jest.spyOn(store, "listReviews");

    await expect(getReviewSummary(store, database(null), userB, targetA)).rejects.toBeInstanceOf(
      TargetNotFoundError,
    );
    expect(listReviews).not.toHaveBeenCalled();
  });

  it("propagates a review database failure instead of reporting zero reviews", async () => {
    const store = storeFor({ [targetA]: userA }, []);
    jest.spyOn(store, "listReviews").mockRejectedValue(new Error("database unavailable"));

    await expect(getReviewSummary(store, database(null), userA, targetA)).rejects.toThrow(
      "database unavailable",
    );
  });

  it("propagates an ingestion-status database failure instead of returning an incomplete summary", async () => {
    await expect(
      getReviewSummary(
        storeFor({ [targetA]: userA }, [review("a1", targetA, 5)]),
        database(null, { message: "database unavailable" }),
        userA,
        targetA,
      ),
    ).rejects.toThrow("We couldn't load or save the ingestion result. Please try again.");
  });
});
