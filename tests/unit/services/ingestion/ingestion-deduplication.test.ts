/** @jest-environment node */
/**
 * S3-011 ingestion re-run behavior, end to end through the real Outscraper client, adapter,
 * normalizer, and application dedupe. Only the network and PostgreSQL are replaced:
 * - the provider is a local synthetic payload served by a fake fetch (no live calls);
 * - FakeReviewDatabase models finish_ingestion_attempt: one atomic completion per attempt, a
 *   (target, identity_key) unique index, and ON CONFLICT DO NOTHING. It derives keys with
 *   reviewIdentityKey, which tests/db/review-deduplication.test.sql proves equal to the SQL
 *   generated column through shared golden vectors. The real constraint is tested there.
 */
import { reconcileIngestion } from "@/services/ingestion/ingestion-lifecycle";
import { getOwnedTargetOrThrow } from "@/services/analysis-targets/target-ownership";
import {
  getBoundAttempt,
  getLatestAttempt,
  IngestionPersistenceError,
  type IngestionAttemptRow,
} from "@/services/ingestion/ingestion-attempt-repository";
import { getExtractedReviews } from "@/services/ingestion/outscraper-service";
import { reviewIdentityKey } from "@/services/reviews/review-identity";

jest.mock("@/services/analysis-targets/target-ownership", () => ({
  getOwnedTargetOrThrow: jest.fn(),
}));
jest.mock("@/services/ingestion/ingestion-attempt-repository", () => ({
  ...jest.requireActual("@/services/ingestion/ingestion-attempt-repository"),
  getLatestAttempt: jest.fn(),
  getBoundAttempt: jest.fn(),
}));

type Owner = "user-a" | "user-b";
type Target = { id: string; ownerId: Owner; placeId: string; name: string };
const TARGET_A: Target = {
  id: "target-a",
  ownerId: "user-a",
  placeId: "ChIJTargetA",
  name: "Cafe A",
};
const TARGET_A2: Target = {
  id: "target-a2",
  ownerId: "user-a",
  placeId: "ChIJTargetA2",
  name: "Cafe A2",
};
const TARGET_B: Target = {
  id: "target-b",
  ownerId: "user-b",
  placeId: "ChIJTargetB",
  name: "Cafe B",
};
const TARGETS = [TARGET_A, TARGET_A2, TARGET_B];

interface StoredReview {
  id: string;
  analysisTargetId: string;
  createdAt: number;
  identityKey: string;
  text: string;
  rating: number;
  sourceReviewId: string | null;
  reviewerName: string | null;
}

class FakeReviewDatabase {
  readonly reviews: StoredReview[] = [];
  readonly attempts = new Map<string, IngestionAttemptRow>();
  failNextFinish: "before-commit" | "after-commit" | null = null;
  private clock = 0;
  private nextId = 0;

  openAttempt(target: Target, jobId: string): IngestionAttemptRow {
    const attempt: IngestionAttemptRow = {
      id: `attempt-${jobId}`,
      analysis_target_id: target.id,
      owner_id: target.ownerId,
      source_url: `https://www.google.com/maps/place/${target.name}`,
      submitted_query: target.placeId,
      query_kind: "place_id",
      expected_place_id: target.placeId,
      provider_request_id: jobId,
      status: "processing",
      started_at: new Date().toISOString(),
      finished_at: null,
      saved_count: 0,
      skipped_count: 0,
      error_code: null,
      identity_basis: null,
      verified_identity: null,
    };
    this.attempts.set(attempt.id, attempt);
    return attempt;
  }

  latestFor(targetId: string) {
    return [...this.attempts.values()].filter((a) => a.analysis_target_id === targetId).at(-1)!;
  }

  /** Browser ordering contract: (created_at, id). */
  list(targetId: string) {
    return this.reviews
      .filter((review) => review.analysisTargetId === targetId)
      .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
  }

  finish = jest.fn(
    async (
      attemptId: string,
      ownerId: string,
      rows: Record<string, unknown>[],
      skippedCount: number,
      identity: IngestionAttemptRow["verified_identity"],
      errorCode: string | null,
    ): Promise<IngestionAttemptRow> => {
      const attempt = this.attempts.get(attemptId);
      if (!attempt || attempt.owner_id !== ownerId) throw new IngestionPersistenceError();
      if (attempt.status !== "processing") return { ...attempt };
      const failure = this.failNextFinish;
      this.failNextFinish = null;
      // The real RPC is one transaction: a failure before commit leaves nothing behind.
      if (failure === "before-commit") throw new IngestionPersistenceError();

      const createdAt = ++this.clock;
      const staged: StoredReview[] = [];
      for (const row of errorCode ? [] : rows) {
        const identityKey = reviewIdentityKey({
          text: row.text as string,
          rating: row.rating as number,
          sourceReviewId: (row.source_review_id as string | null) ?? undefined,
          reviewerName: (row.reviewer_name as string | null) ?? undefined,
          reviewDate: row.review_date ? new Date(row.review_date as string) : undefined,
        });
        const exists = [...this.reviews, ...staged].some(
          (review) =>
            review.analysisTargetId === attempt.analysis_target_id &&
            review.identityKey === identityKey,
        );
        if (exists) continue; // ON CONFLICT (analysis_target_id, identity_key) DO NOTHING
        staged.push({
          id: `review-${String(++this.nextId).padStart(4, "0")}`,
          analysisTargetId: attempt.analysis_target_id,
          createdAt,
          identityKey,
          text: row.text as string,
          rating: row.rating as number,
          sourceReviewId: (row.source_review_id as string | null) ?? null,
          reviewerName: (row.reviewer_name as string | null) ?? null,
        });
      }
      this.reviews.push(...staged);
      Object.assign(attempt, {
        status: errorCode ? "failed" : "succeeded",
        finished_at: new Date().toISOString(),
        saved_count: staged.length,
        skipped_count: skippedCount,
        verified_identity: identity,
        error_code: errorCode,
        identity_basis: errorCode ? null : "expected_place_id",
      });
      // Committed, but the response is lost on the way back to the application.
      if (failure === "after-commit") throw new IngestionPersistenceError();
      return { ...attempt };
    },
  );
}

type ProviderReview = {
  review_id?: string | number | null;
  review_text?: string | null;
  review_rating?: number | null;
  author_title?: string | null;
  review_timestamp?: number | null;
};

let db: FakeReviewDatabase;
const payloads = new Map<string, { target: Target; reviews: ProviderReview[] }>();

function providerFetch(jobId: string) {
  return (async () => {
    const { target, reviews } = payloads.get(jobId)!;
    return new Response(
      JSON.stringify({
        id: jobId,
        status: "Success",
        data: reviews.map((review) => ({
          place_id: target.placeId,
          name: target.name,
          google_id: `google-${target.id}`,
          review_link: null,
          ...review,
        })),
      }),
      { status: 200 },
    );
  }) as unknown as typeof fetch;
}

function dependencies() {
  return {
    writer: {
      reserve: jest.fn(),
      bind: jest.fn(),
      expireUnbound: jest.fn(),
      findForRecovery: jest.fn(),
      expireBound: jest.fn(async (attemptId: string) => ({ ...db.attempts.get(attemptId)! })),
      finish: db.finish,
    },
    extract: ((requestId, expected) =>
      getExtractedReviews(
        requestId,
        expected,
        providerFetch(requestId),
      )) as typeof getExtractedReviews,
    storageApproved: true,
    recoveryUrl: jest.fn(),
  };
}

let jobs = 0;
/** One refresh run: a new bound attempt whose provider job returns `reviews`. */
async function refresh(target: Target, reviews: ProviderReview[]) {
  const jobId = `job-${++jobs}`;
  payloads.set(jobId, { target, reviews });
  db.openAttempt(target, jobId);
  return poll(target);
}
/** Polls the target's latest attempt again (a retry, a second tab, or a repeated refresh). */
function poll(target: Target) {
  return reconcileIngestion({} as never, target.ownerId, target.id, dependencies());
}

const crispy: ProviderReview = {
  review_id: "ChZ-crispy",
  review_text: "Crispy fries",
  review_rating: 5,
  author_title: "Cy",
  review_timestamp: 1_790_000_000,
};
const coffee: ProviderReview = {
  review_id: "ChZ-coffee",
  review_text: "Cold coffee",
  review_rating: 2,
  author_title: "Di",
  review_timestamp: 1_790_000_100,
};
const staff: ProviderReview = {
  review_id: "ChZ-staff",
  review_text: "Friendly staff",
  review_rating: 4,
  author_title: "Ed",
  review_timestamp: 1_790_000_200,
};
const noId: ProviderReview = {
  review_text: "Great patio, slow kitchen",
  review_rating: 3,
  author_title: "Flo",
  review_timestamp: 1_790_000_300,
};

const originalKey = process.env.OUTSCRAPER_API_KEY;
beforeEach(() => {
  process.env.OUTSCRAPER_API_KEY = "synthetic-test-key";
  db = new FakeReviewDatabase();
  payloads.clear();
  jest.spyOn(console, "info").mockImplementation(() => {});
  jest.mocked(getOwnedTargetOrThrow).mockImplementation(async (_client, targetId, ownerId) => {
    const target = TARGETS.find((candidate) => candidate.id === targetId);
    if (!target || target.ownerId !== ownerId) throw new Error("not owned");
    return {
      id: target.id,
      ownerId: target.ownerId,
      name: target.name,
      platform: "google_maps",
      sourceUrl: `https://www.google.com/maps/place/${target.name}`,
      googlePlaceId: target.placeId,
      createdAt: "2026-11-01",
    };
  });
  jest
    .mocked(getLatestAttempt)
    .mockImplementation(async (_client, _owner, targetId) => ({ ...db.latestFor(targetId) }));
  jest.mocked(getBoundAttempt).mockImplementation(async (_client, _owner, _target, jobId) => ({
    ...[...db.attempts.values()].find((a) => a.provider_request_id === jobId)!,
  }));
});
afterEach(() => {
  jest.restoreAllMocks();
  if (originalKey === undefined) delete process.env.OUTSCRAPER_API_KEY;
  else process.env.OUTSCRAPER_API_KEY = originalKey;
});

it("(a) re-running the same refresh creates zero new reviews and still succeeds", async () => {
  const first = await refresh(TARGET_A, [crispy, coffee]);
  const before = db.list(TARGET_A.id);

  const second = await refresh(TARGET_A, [crispy, coffee]);

  expect(first).toMatchObject({ state: "succeeded", savedCount: 2, skippedCount: 0 });
  expect(second).toMatchObject({ state: "succeeded", savedCount: 0, skippedCount: 0 });
  expect(db.list(TARGET_A.id)).toEqual(before);
});

it("(b) the same review twice in one provider batch is stored once and is not 'skipped'", async () => {
  const result = await refresh(TARGET_A, [crispy, coffee, { ...crispy }, staff]);

  expect(result).toMatchObject({ state: "succeeded", savedCount: 3, skippedCount: 0 });
  expect(db.list(TARGET_A.id).map((review) => review.text)).toEqual([
    "Crispy fries",
    "Cold coffee",
    "Friendly staff",
  ]);
  // The application collapses the repeat before the database sees the batch.
  expect(db.finish.mock.calls[0][2]).toHaveLength(3);
});

it("(c)/(d) a review repeated in a later refresh is stored once; a new review is inserted", async () => {
  await refresh(TARGET_A, [crispy, coffee]);
  const original = db.list(TARGET_A.id);

  // The provider edited crispy's text; its stable review_id still identifies it.
  const result = await refresh(TARGET_A, [
    { ...crispy, review_text: "Crispy fries (edited)" },
    staff,
    coffee,
  ]);

  expect(result).toMatchObject({ state: "succeeded", savedCount: 1 });
  const stored = db.list(TARGET_A.id);
  expect(stored.map((review) => review.sourceReviewId)).toEqual([
    "ChZ-crispy",
    "ChZ-coffee",
    "ChZ-staff",
  ]);
  // First write wins: existing ids, positions, and text are never changed by a refresh.
  expect(stored.slice(0, 2)).toEqual(original);
  expect(stored[0].text).toBe("Crispy fries");
});

it("(e) a review without a source id is deduplicated by its normalized fingerprint", async () => {
  await refresh(TARGET_A, [noId]);

  const result = await refresh(TARGET_A, [
    { ...noId, review_text: "  GREAT patio,  slow   kitchen\n", author_title: " flo " },
    { ...noId, review_rating: 2 },
  ]);

  expect(result).toMatchObject({ state: "succeeded", savedCount: 1 });
  const stored = db.list(TARGET_A.id);
  expect(stored).toHaveLength(2);
  expect(stored.every((review) => review.sourceReviewId === null)).toBe(true);
  expect(stored.map((review) => review.rating)).toEqual([3, 2]);
});

it("(f) identical reviews of different targets and different accounts are never merged", async () => {
  await refresh(TARGET_A, [crispy, noId]);
  const sameUserOtherTarget = await refresh(TARGET_A2, [crispy, noId]);
  const otherAccount = await refresh(TARGET_B, [crispy, noId]);

  expect(sameUserOtherTarget).toMatchObject({ state: "succeeded", savedCount: 2 });
  expect(otherAccount).toMatchObject({ state: "succeeded", savedCount: 2 });
  expect(db.list(TARGET_A.id)).toHaveLength(2);
  expect(db.list(TARGET_A2.id)).toHaveLength(2);
  expect(db.list(TARGET_B.id)).toHaveLength(2);
});

it("(g) a storage failure before commit saves nothing, and the retry stores each review once", async () => {
  db.failNextFinish = "before-commit";
  await expect(refresh(TARGET_A, [crispy, coffee, crispy])).rejects.toBeInstanceOf(
    IngestionPersistenceError,
  );
  expect(db.reviews).toHaveLength(0);
  expect(db.latestFor(TARGET_A.id).status).toBe("processing");

  const retried = await poll(TARGET_A);

  expect(retried).toMatchObject({ state: "succeeded", savedCount: 2 });
  expect(db.list(TARGET_A.id)).toHaveLength(2);
});

it("(g) a lost response after commit is not saved again by the retry or later polls", async () => {
  db.failNextFinish = "after-commit";
  await expect(refresh(TARGET_A, [crispy, coffee])).rejects.toBeInstanceOf(
    IngestionPersistenceError,
  );

  const retried = await poll(TARGET_A);
  await poll(TARGET_A);

  expect(retried).toMatchObject({ state: "succeeded", savedCount: 2 });
  expect(db.finish).toHaveBeenCalledTimes(1);
  expect(db.list(TARGET_A.id)).toHaveLength(2);
});

it("(h) counts and ordering stay correct across several refreshes", async () => {
  const unusable: ProviderReview = { review_id: "ChZ-empty", review_text: "", review_rating: 4 };
  const runs = [
    await refresh(TARGET_A, [crispy, coffee, unusable]),
    await refresh(TARGET_A, [coffee, staff, staff, noId]),
    await refresh(TARGET_A, [noId, crispy, staff, coffee]),
  ];

  expect(runs.map(({ savedCount, skippedCount }) => [savedCount, skippedCount])).toEqual([
    [2, 1],
    [2, 0],
    [0, 0],
  ]);
  const stored = db.list(TARGET_A.id);
  expect(stored.map((review) => review.text)).toEqual([
    "Crispy fries",
    "Cold coffee",
    "Friendly staff",
    "Great patio, slow kitchen",
  ]);
  expect(new Set(stored.map((review) => review.identityKey)).size).toBe(stored.length);
  expect(runs.reduce((sum, run) => sum + run.savedCount, 0)).toBe(stored.length);
});
