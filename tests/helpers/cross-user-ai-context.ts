import { crossUserAiContextFixture } from "../fixtures/cross-user-ai-context.synthetic";
import type { Review, ReviewStore } from "@/services/reviews/review-service";

const { users, targets, reviews } = crossUserAiContextFixture;

export const UNEXPECTED_AGGREGATE_REVIEWS_ERROR =
  "This read-only security fixture must not aggregate reviews.";

/** Compatible with both the current ReviewStore and S2-006's proposed expanded port. */
type CrossUserSecurityReviewStore = ReviewStore & {
  aggregateReviews(targetId: string): Promise<never>;
};

export interface CrossUserSecurityStoreOptions {
  readonly reviewRows?: Partial<{
    readonly targetA: readonly Review[];
    readonly targetB: readonly Review[];
  }>;
}

/** In-memory ReviewStore for the S2-016 Phase 1 review-service boundary. */
export function createCrossUserSecurityStore(options: CrossUserSecurityStoreOptions = {}) {
  const owners = new Map([
    [targets.targetA.id, users.userA.id],
    [targets.targetB.id, users.userB.id],
  ]);
  const rows = new Map<string, readonly Review[]>([
    [targets.targetA.id, options.reviewRows?.targetA ?? reviews.targetA],
    [targets.targetB.id, options.reviewRows?.targetB ?? reviews.targetB],
  ]);
  const ownershipChecks: Array<{ targetId: string; userId: string }> = [];
  const reviewLookups: string[] = [];

  const store: CrossUserSecurityReviewStore = {
    async isTargetOwnedBy(targetId, userId) {
      ownershipChecks.push({ targetId, userId });
      return owners.get(targetId) === userId;
    },
    async insertReviews() {
      throw new Error("This read-only security fixture must not insert reviews.");
    },
    async aggregateReviews() {
      throw new Error(UNEXPECTED_AGGREGATE_REVIEWS_ERROR);
    },
    async listReviews(targetId) {
      reviewLookups.push(targetId);
      return [...(rows.get(targetId) ?? [])];
    },
  };

  return { store, ownershipChecks, reviewLookups };
}
