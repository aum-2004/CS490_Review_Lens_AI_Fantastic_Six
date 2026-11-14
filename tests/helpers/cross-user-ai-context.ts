import { crossUserAiContextFixture } from "../fixtures/cross-user-ai-context.synthetic";
import type { Review, ReviewStore } from "@/services/reviews/review-service";

const { users, targets, reviews } = crossUserAiContextFixture;

export interface CrossUserSecurityStoreOptions {
  readonly reviewRows?: Partial<{
    readonly targetA: readonly Review[];
    readonly targetB: readonly Review[];
  }>;
}

/** Shared in-memory ReviewStore for the S2-016 Phase 1 and Phase 2 security suites. */
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

  const store: ReviewStore = {
    async isTargetOwnedBy(targetId, userId) {
      ownershipChecks.push({ targetId, userId });
      return owners.get(targetId) === userId;
    },
    async insertReviews() {
      throw new Error("This read-only security fixture must not insert reviews.");
    },
    async listReviews(targetId) {
      reviewLookups.push(targetId);
      return [...(rows.get(targetId) ?? [])];
    },
  };

  return { store, ownershipChecks, reviewLookups };
}
