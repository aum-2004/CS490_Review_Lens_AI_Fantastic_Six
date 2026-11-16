/** @jest-environment node */

import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAuthenticatedUser } from "@/services/auth/auth-service";
import {
  buildReviewDatasetContext,
  MAX_CONTEXT_EVIDENCE_BYTES,
  MAX_CONTEXT_REVIEWS,
} from "@/services/qa/review-context";
import { getReviewSummary } from "@/services/reviews/review-summary";
import type { ReviewStore } from "@/services/reviews/review-service";

jest.mock("server-only", () => ({}));
jest.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: jest.fn() }));
jest.mock("@/services/auth/auth-service", () => ({ getAuthenticatedUser: jest.fn() }));
jest.mock("@/services/ingestion/ingestion-attempt-repository", () => ({
  getLatestAttempt: jest.fn().mockResolvedValue(null),
}));

const USER = "11111111-1111-4111-8111-111111111111";
const TARGET_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const TARGET_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

type PersistedRow = {
  id: string;
  analysis_target_id: string;
  review_text: string;
  rating: number;
  review_date: string | null;
  created_at: string;
};

function makeRow(id: string, targetId: string, text: string, rating: number): PersistedRow {
  return {
    id,
    analysis_target_id: targetId,
    review_text: text,
    rating,
    review_date: null,
    created_at: "2026-11-16T00:00:00Z",
  };
}

function setup(rows: PersistedRow[]) {
  const targets = [
    {
      id: TARGET_A,
      owner_id: USER,
      name: "Target A",
      platform: "google_maps",
      source_url: "https://maps.google.com/?cid=A",
      google_place_id: null,
      created_at: "2026-11-16T00:00:00Z",
    },
    {
      id: TARGET_B,
      owner_id: USER,
      name: "Target B",
      platform: "google_maps",
      source_url: "https://maps.google.com/?cid=B",
      google_place_id: null,
      created_at: "2026-11-16T00:00:00Z",
    },
  ];
  const fetcher: typeof fetch = async (input) => {
    const url = new URL(String(input));
    let selected: Record<string, unknown>[] = url.pathname.endsWith("/reviews") ? rows : targets;
    for (const [key, value] of url.searchParams) {
      if (value.startsWith("eq.")) selected = selected.filter((row) => row[key] === value.slice(3));
    }
    const count = selected.length;
    const limit = Number(url.searchParams.get("limit") ?? Infinity);
    selected = selected.slice(0, limit);
    const columns = url.searchParams.get("select")!.split(",");
    selected = selected.map((row) => Object.fromEntries(columns.map((key) => [key, row[key]])));
    return new Response(JSON.stringify(selected), {
      headers: {
        "Content-Range": selected.length ? `0-${selected.length - 1}/${count}` : `*/${count}`,
      },
    });
  };
  const client = createClient("http://summary-boundary.supabase", "dummy-publishable-key", {
    global: { fetch: fetcher },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  jest.mocked(createSupabaseServerClient).mockResolvedValue(client);
  jest.mocked(getAuthenticatedUser).mockResolvedValue({ id: USER, email: null });
  return client;
}

function storeFor(rows: PersistedRow[]): ReviewStore {
  return {
    isTargetOwnedBy: async (targetId, userId) =>
      userId === USER && [TARGET_A, TARGET_B].includes(targetId),
    insertReviews: jest.fn(),
    aggregateReviews: async (targetId) => {
      const eligible = rows.filter((row) => row.analysis_target_id === targetId);
      return {
        reviewCount: eligible.length,
        averageRating:
          eligible.length === 0
            ? null
            : eligible.reduce((total, row) => total + row.rating, 0) / eligible.length,
      };
    },
    listReviews: async () => [],
  };
}

function ingestionDatabase() {
  const query = {
    select: () => query,
    eq: () => query,
    maybeSingle: async () => ({ data: null, error: null }),
  };
  return { from: jest.fn(() => query) } as never;
}

it("uses the same eligible persisted target rows for summary metrics and Q&A context", async () => {
  const rows = [
    makeRow("a-1", TARGET_A, "Target A review one", 5),
    makeRow("a-2", TARGET_A, "Target A review two", 3),
    makeRow("b-1", TARGET_B, "Target B review", 1),
  ];
  setup(rows);

  const context = await buildReviewDatasetContext(TARGET_A);
  const summary = await getReviewSummary(storeFor(rows), ingestionDatabase(), USER, TARGET_A);

  expect(context.reviewCount).toBe(summary.reviewCount);
  expect(context.reviews.map((review) => review.id)).toEqual(["a-1", "a-2"]);
  expect(summary.averageRating).toBe(4);
  expect(context.reviewCount).toBeLessThanOrEqual(MAX_CONTEXT_REVIEWS);
  expect(context.evidenceBytes).toBeLessThanOrEqual(MAX_CONTEXT_EVIDENCE_BYTES);
  expect(context.evidenceJson).not.toContain("Target B review");
});

it("keeps the exact summary while Q&A rejects an oversized persisted dataset", async () => {
  const rows = Array.from({ length: MAX_CONTEXT_REVIEWS + 1 }, (_, index) =>
    makeRow(`a-${index}`, TARGET_A, "Persisted review", 4),
  );
  setup(rows);

  await expect(buildReviewDatasetContext(TARGET_A)).rejects.toMatchObject({
    code: "REVIEW_CONTEXT_TOO_LARGE",
  });
  await expect(
    getReviewSummary(storeFor(rows), ingestionDatabase(), USER, TARGET_A),
  ).resolves.toMatchObject({ reviewCount: MAX_CONTEXT_REVIEWS + 1, averageRating: 4 });
});
