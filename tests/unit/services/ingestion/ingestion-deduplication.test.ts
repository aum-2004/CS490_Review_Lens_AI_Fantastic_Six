/** @jest-environment node */
/**
 * S3-011 / S3-010 refresh behavior, end to end through the real Outscraper client, adapter,
 * normalizer, and in-batch collapse. Only the network and PostgreSQL are replaced:
 * - the provider is a local synthetic payload served by a fake fetch (no live calls);
 * - FakeReviewDatabase models finish_ingestion_attempt + public.merge_target_reviews: one atomic
 *   completion per attempt, reconciliation by the shared matchStoredReview/mergeReviewFields
 *   rules, and no write (no updated_at change) when nothing differs.
 * tests/db/review-deduplication.test.sql proves the SQL makes the same decisions, enforces them
 * with partial unique indexes, and computes the same fingerprints (shared golden vectors).
 * Numbers in brackets refer to the PR review's regression list; [9] concurrency is DB-only
 * (tests/db/review-deduplication-concurrency.test.sh).
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
import {
  matchStoredReview,
  mergeReviewFields,
  reviewFingerprint,
} from "@/services/reviews/review-identity";
import type { NormalizedReview } from "@/services/reviews/types";

jest.mock("@/services/analysis-targets/target-ownership", () => ({
  getOwnedTargetOrThrow: jest.fn(),
}));
jest.mock("@/services/ingestion/ingestion-attempt-repository", () => ({
  ...jest.requireActual("@/services/ingestion/ingestion-attempt-repository"),
  getLatestAttempt: jest.fn(),
  getBoundAttempt: jest.fn(),
}));

type Target = { id: string; ownerId: string; placeId: string; name: string };
const TARGET_A: Target = { id: "target-a", ownerId: "user-a", placeId: "ChIJTargetA", name: "A" };
const TARGET_A2: Target = {
  id: "target-a2",
  ownerId: "user-a",
  placeId: "ChIJTargetA2",
  name: "A2",
};
const TARGET_B: Target = { id: "target-b", ownerId: "user-b", placeId: "ChIJTargetB", name: "B" };
const TARGETS = [TARGET_A, TARGET_A2, TARGET_B];

interface StoredReview extends NormalizedReview {
  id: string;
  analysisTargetId: string;
  createdAt: number;
  updatedAt: number;
  /** Incremented on every write, like a new row version in PostgreSQL. */
  version: number;
}

const SOURCE_FIELDS = [
  "text",
  "rating",
  "sourceReviewId",
  "reviewerName",
  "reviewDate",
  "reviewUrl",
  "sourceMetadata",
] as const;
const sourceFields = (review: NormalizedReview) =>
  JSON.stringify(SOURCE_FIELDS.map((field) => review[field] ?? null));

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

  /** Stores a row directly, like data written before S3-011 or by another refresh. */
  seed(target: Target, review: NormalizedReview): StoredReview {
    const now = ++this.clock;
    const row: StoredReview = {
      ...review,
      id: `review-${String(++this.nextId).padStart(4, "0")}`,
      analysisTargetId: target.id,
      createdAt: now,
      updatedAt: now,
      version: 1,
    };
    this.reviews.push(row);
    return row;
  }

  latestFor(targetId: string) {
    return [...this.attempts.values()].filter((a) => a.analysis_target_id === targetId).at(-1)!;
  }

  /** Review browser contract: every review of the target, ordered by (created_at, id). */
  list(targetId: string) {
    return this.reviews
      .filter((review) => review.analysisTargetId === targetId)
      .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))
      .map((review) => ({ ...review }));
  }

  /** Mirrors public.merge_target_reviews for one row; returns whether it inserted. */
  private merge(targetId: string, incoming: NormalizedReview, createdAt: number): boolean {
    const rows = this.reviews.filter((review) => review.analysisTargetId === targetId);
    const decision = matchStoredReview(
      rows.map((row) => ({
        id: row.id,
        sourceReviewId: row.sourceReviewId ?? null,
        fingerprint: reviewFingerprint(row),
        createdAt: row.createdAt,
      })),
      incoming,
    );
    if (decision.action === "insert") {
      this.reviews.push({
        ...incoming,
        id: `review-${String(++this.nextId).padStart(4, "0")}`,
        analysisTargetId: targetId,
        createdAt,
        updatedAt: createdAt,
        version: 1,
      });
      return true;
    }
    const row = rows.find((candidate) => candidate.id === decision.rowId)!;
    const merged = mergeReviewFields(row, incoming);
    if (sourceFields(merged) !== sourceFields(row)) {
      Object.assign(row, merged, { updatedAt: ++this.clock, version: row.version + 1 });
    }
    return false;
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
      let saved = 0;
      for (const row of errorCode ? [] : rows) {
        const incoming: NormalizedReview = {
          text: row.text as string,
          rating: row.rating as number,
          sourceReviewId: (row.source_review_id as string | null) ?? undefined,
          reviewerName: (row.reviewer_name as string | null) ?? undefined,
          reviewDate: row.review_date ? new Date(row.review_date as string) : undefined,
          reviewUrl: (row.review_url as string | null) ?? undefined,
          sourceMetadata: (row.source_metadata as Record<string, unknown> | null) ?? undefined,
        };
        if (this.merge(attempt.analysis_target_id, incoming, createdAt)) saved++;
      }
      Object.assign(attempt, {
        status: errorCode ? "failed" : "succeeded",
        finished_at: new Date().toISOString(),
        saved_count: saved,
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
  review_link?: string | null;
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
  review_link: "https://maps.google.com/review/crispy",
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
const withoutId = (review: ProviderReview): ProviderReview => ({ ...review, review_id: null });

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

it("[1] a review first seen without an id adopts the id when it appears", async () => {
  await refresh(TARGET_A, [withoutId(crispy)]);
  const [before] = db.list(TARGET_A.id);

  const result = await refresh(TARGET_A, [crispy]);

  expect(result).toMatchObject({ state: "succeeded", savedCount: 0 });
  const stored = db.list(TARGET_A.id);
  expect(stored).toHaveLength(1);
  expect(stored[0]).toMatchObject({
    id: before.id,
    createdAt: before.createdAt,
    sourceReviewId: "ChZ-crispy",
  });
});

it("[2] a review first seen with an id keeps it when a refresh omits the id", async () => {
  await refresh(TARGET_A, [crispy]);
  const [before] = db.list(TARGET_A.id);

  await refresh(TARGET_A, [withoutId(crispy)]);

  expect(db.list(TARGET_A.id)).toEqual([before]);
});

it("[3] identical content with different source ids stays two reviews", async () => {
  const result = await refresh(TARGET_A, [crispy, { ...crispy, review_id: "ChZ-other" }]);

  expect(result).toMatchObject({ savedCount: 2 });
  expect(db.list(TARGET_A.id).map((review) => review.sourceReviewId)).toEqual([
    "ChZ-crispy",
    "ChZ-other",
  ]);
});

it("[4] with several stored id-less copies, the incoming id adopts the oldest one only", async () => {
  const copy: NormalizedReview = {
    text: "Crispy fries",
    rating: 5,
    reviewerName: "Cy",
    reviewDate: new Date(1_790_000_000_000),
  };
  const oldest = db.seed(TARGET_A, copy);
  const newer = db.seed(TARGET_A, { ...copy, text: "crispy FRIES" });

  await refresh(TARGET_A, [crispy]);

  const stored = db.list(TARGET_A.id);
  expect(stored.map((review) => [review.id, review.sourceReviewId ?? null])).toEqual([
    [oldest.id, "ChZ-crispy"],
    [newer.id, null],
  ]);
});

it("[5] a refresh with changed text and rating updates the review in place", async () => {
  await refresh(TARGET_A, [crispy, coffee]);
  const before = db.list(TARGET_A.id);

  const result = await refresh(TARGET_A, [
    { ...crispy, review_text: "Crispy fries, soggy buns", review_rating: 3 },
    coffee,
  ]);

  expect(result).toMatchObject({ state: "succeeded", savedCount: 0 });
  const after = db.list(TARGET_A.id);
  expect(after.map(({ id, createdAt }) => [id, createdAt])).toEqual(
    before.map(({ id, createdAt }) => [id, createdAt]),
  );
  expect(after[0]).toMatchObject({ text: "Crispy fries, soggy buns", rating: 3 });
  expect(after[0].updatedAt).toBeGreaterThan(before[0].updatedAt);
  expect(after[1]).toEqual(before[1]);
});

it("[6] a refresh with identical data writes nothing", async () => {
  await refresh(TARGET_A, [crispy, coffee]);
  const before = db.list(TARGET_A.id);

  const result = await refresh(TARGET_A, [crispy, coffee]);

  expect(result).toMatchObject({ state: "succeeded", savedCount: 0, skippedCount: 0 });
  expect(db.list(TARGET_A.id)).toEqual(before);
});

it("[7] a missing field in a refresh never erases the stored value", async () => {
  await refresh(TARGET_A, [crispy]);

  await refresh(TARGET_A, [{ ...crispy, review_link: null, review_text: "Crispy fries!" }]);

  expect(db.list(TARGET_A.id)[0]).toMatchObject({
    text: "Crispy fries!",
    reviewUrl: "https://maps.google.com/review/crispy",
  });
});

it("[8] repeats in one batch and across batches are one review; the last value wins", async () => {
  const first = await refresh(TARGET_A, [
    crispy,
    coffee,
    { ...crispy, review_text: "Crispy fries (2nd copy)", review_rating: 4 },
  ]);
  expect(first).toMatchObject({ savedCount: 2, skippedCount: 0 });
  // The application merges the repeat before the database sees the batch.
  expect(db.finish.mock.calls[0][2]).toHaveLength(2);
  expect(db.list(TARGET_A.id)[0]).toMatchObject({ text: "Crispy fries (2nd copy)", rating: 4 });

  await refresh(TARGET_A, [{ ...crispy, review_text: "Crispy fries (3rd)" }]);

  const stored = db.list(TARGET_A.id);
  expect(stored).toHaveLength(2);
  expect(stored[0]).toMatchObject({ text: "Crispy fries (3rd)", rating: 5 });
});

it("[10] identical reviews of different targets and accounts are never matched", async () => {
  await refresh(TARGET_A, [crispy, withoutId(coffee)]);
  const sameUserOtherTarget = await refresh(TARGET_A2, [crispy, withoutId(coffee)]);
  const otherAccount = await refresh(TARGET_B, [crispy, withoutId(coffee)]);

  expect(sameUserOtherTarget).toMatchObject({ state: "succeeded", savedCount: 2 });
  expect(otherAccount).toMatchObject({ state: "succeeded", savedCount: 2 });
  expect(db.reviews).toHaveLength(6);
});

it("[11] ids cited earlier still resolve, in browser order, after adoption and refresh", async () => {
  await refresh(TARGET_A, [withoutId(crispy), coffee]);
  const cited = db.list(TARGET_A.id).map((review) => review.id);

  await refresh(TARGET_A, [{ ...crispy, review_text: "Crispy fries (edited)" }, coffee, staff]);

  const stored = db.list(TARGET_A.id);
  expect(stored.slice(0, 2).map((review) => review.id)).toEqual(cited);
  expect(stored.find((review) => review.id === cited[0])).toMatchObject({
    sourceReviewId: "ChZ-crispy",
    text: "Crispy fries (edited)",
  });
  expect(stored[2].text).toBe("Friendly staff");
});

it("a storage failure before commit saves nothing, and the retry stores each review once", async () => {
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

it("a lost response after commit is not saved again by the retry or later polls", async () => {
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

it("counts and ordering stay correct across several refreshes", async () => {
  const unusable: ProviderReview = { review_id: "ChZ-empty", review_text: "", review_rating: 4 };
  const runs = [
    await refresh(TARGET_A, [crispy, withoutId(coffee), unusable]),
    await refresh(TARGET_A, [coffee, staff, staff]),
    await refresh(TARGET_A, [staff, crispy, withoutId(coffee)]),
  ];

  expect(runs.map(({ savedCount, skippedCount }) => [savedCount, skippedCount])).toEqual([
    [2, 1],
    [1, 0],
    [0, 0],
  ]);
  const stored = db.list(TARGET_A.id);
  expect(stored.map((review) => [review.text, review.sourceReviewId])).toEqual([
    ["Crispy fries", "ChZ-crispy"],
    ["Cold coffee", "ChZ-coffee"],
    ["Friendly staff", "ChZ-staff"],
  ]);
  expect(runs.reduce((sum, run) => sum + run.savedCount, 0)).toBe(stored.length);
});
