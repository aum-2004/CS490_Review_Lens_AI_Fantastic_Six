import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { AnalysisTarget } from "@/services/analysis-targets/analysis-target-repository";
import type { Review } from "@/services/reviews/review-service";

import type { QaFixtureDataset } from "../../fixtures/qa/datasets";
import type { QaActor } from "./contract";

/**
 * S2-003 fake Supabase for the real Q&A pipeline, following Shawn's S2-010 test pattern: a REAL
 * supabase-js client whose `global.fetch` is replaced, so the production query builders, header
 * handling and response parsing all run. It serves:
 *
 * - `GET /auth/v1/user`: verifies the fake session token, so the REAL `getAuthenticatedUser`
 *   (S1-009) runs, including its 401 → signed-out and 5xx → unavailable mapping;
 * - `GET /rest/v1/analysis_targets` and `/rest/v1/reviews`: a PostgREST subset (`select`, `eq.`,
 *   `order`, `limit`, `Prefer: count=exact`) over in-memory rows built from fixture datasets.
 *
 * NOT emulated: Row Level Security. Rows are filtered only by the query's own `eq.` filters, so
 * a foreign target is denied only if the application's ownership checks deny it. That is
 * deliberate: the isolation these tests prove comes from app-layer checks. RLS itself is covered
 * by `npm run test:db`.
 *
 * Every request is recorded. No real network is used: the injected fetch never calls out.
 */

export const FAKE_SUPABASE_URL = "http://qa-harness.supabase.test";
const PUBLISHABLE_KEY = "qa-harness-publishable-key";
const STORAGE_KEY = "qa-harness-auth-token";
/** Year 3000, so session expiry never depends on the (possibly faked) wall clock. */
const SESSION_EXPIRES_AT = 32_503_680_000;

export type FakeAuthMode = "valid" | "rejected" | "unavailable";
export type FakeSupabaseTable = "analysis_targets" | "reviews";

export interface FakeSupabaseRequest {
  readonly kind: "auth" | "rest";
  readonly method: string;
  /** Table name for REST requests, `"user"` for the auth lookup. */
  readonly resource: string;
  readonly params: Readonly<Record<string, string>>;
  /** Actor ID resolved from the bearer token, or undefined for the anon key / unknown token. */
  readonly actorId: string | undefined;
}

export interface AnalysisTargetRow {
  id: string;
  owner_id: string;
  name: string;
  platform: string;
  source_url: string;
  google_place_id: string | null;
  created_at: string;
}

export interface ReviewRow {
  id: string;
  analysis_target_id: string;
  review_text: string;
  rating: number;
  source_review_id: string | null;
  reviewer_name: string | null;
  review_date: string | null;
  review_url: string | null;
  source_metadata: Record<string, unknown> | null;
  created_at: string;
}

export function toTargetRow(target: Readonly<AnalysisTarget>): AnalysisTargetRow {
  return {
    id: target.id,
    owner_id: target.ownerId,
    name: target.name,
    platform: target.platform,
    source_url: target.sourceUrl,
    google_place_id: target.googlePlaceId,
    created_at: target.createdAt,
  };
}

export function toReviewRow(review: Readonly<Review>): ReviewRow {
  return {
    id: review.id,
    analysis_target_id: review.analysisTargetId,
    review_text: review.text,
    rating: review.rating,
    source_review_id: review.sourceReviewId,
    reviewer_name: review.reviewerName,
    review_date: review.reviewDate,
    review_url: review.reviewUrl,
    source_metadata: structuredClone(review.sourceMetadata) as Record<string, unknown> | null,
    created_at: review.createdAt,
  };
}

export interface FakeSupabase {
  /** Mutable copies of the persisted rows. Change them to simulate data changing between calls. */
  readonly tables: { analysis_targets: AnalysisTargetRow[]; reviews: ReviewRow[] };
  readonly requests: readonly FakeSupabaseRequest[];
  /** The signed-in actor, or null when there is no session cookie. */
  readonly actor: QaActor | null;
  signIn(actor: QaActor | null): void;
  /** How `/auth/v1/user` answers a session token: verified, 401 bad_jwt, or 500. */
  setAuthMode(mode: FakeAuthMode): void;
  /** Makes every request to `table` fail with this HTTP status (undefined to clear). */
  failTable(table: FakeSupabaseTable, status: number | undefined): void;
  /** A fresh session-scoped client, like `createSupabaseServerClient()` per request. */
  client(): SupabaseClient;
  clearRequests(): void;
}

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
  });

const tokenFor = (actor: QaActor) => `qa-harness-session:${actor.id}`;

function bearer(headers: Headers): string | undefined {
  const value = headers.get("Authorization");
  return value?.startsWith("Bearer ") ? value.slice("Bearer ".length) : undefined;
}

function compare(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (a === null || a === undefined) return 1;
  if (b === null || b === undefined) return -1;
  return String(a) < String(b) ? -1 : 1;
}

/** Applies PostgREST `order=col.asc,col2.desc` to rows. */
function applyOrder(rows: Record<string, unknown>[], order: string | null) {
  if (!order) return rows;
  const keys = order.split(",").map((part) => {
    const [column, direction] = part.split(".");
    return { column, sign: direction === "desc" ? -1 : 1 };
  });
  return [...rows].sort((left, right) => {
    for (const { column, sign } of keys) {
      const result = compare(left[column], right[column]);
      if (result !== 0) return result * sign;
    }
    return 0;
  });
}

export function createFakeSupabase(datasets: readonly QaFixtureDataset[]): FakeSupabase {
  const tables = {
    analysis_targets: datasets.map((dataset) => toTargetRow(dataset.target)),
    reviews: datasets.flatMap((dataset) => dataset.reviews.map(toReviewRow)),
  };
  const requests: FakeSupabaseRequest[] = [];
  const failures = new Map<FakeSupabaseTable, number>();
  const actorsByToken = new Map<string, QaActor>();
  let actor: QaActor | null = null;
  let authMode: FakeAuthMode = "valid";

  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const headers = new Headers(input instanceof Request ? input.headers : init?.headers);
    const method = (
      init?.method ?? (input instanceof Request ? input.method : "GET")
    ).toUpperCase();
    const token = bearer(headers);
    const params = Object.fromEntries(url.searchParams);
    const caller = token ? actorsByToken.get(token) : undefined;

    if (url.pathname === "/auth/v1/user") {
      requests.push({ kind: "auth", method, resource: "user", params, actorId: caller?.id });
      if (authMode === "unavailable") {
        return json({ code: 500, msg: "QA_HARNESS_PRIVATE_AUTH_DIAGNOSTIC" }, { status: 500 });
      }
      if (authMode === "rejected" || !caller) {
        return json({ code: "bad_jwt", msg: "invalid JWT" }, { status: 401 });
      }
      return json({
        id: caller.id,
        aud: "authenticated",
        role: "authenticated",
        email: caller.email,
        app_metadata: {},
        user_metadata: {},
        created_at: "2026-11-01T12:00:00.000Z",
      });
    }

    const rest = /^\/rest\/v1\/([a-z_]+)$/.exec(url.pathname);
    const table = rest?.[1];
    requests.push({
      kind: "rest",
      method,
      resource: table ?? url.pathname,
      params,
      actorId: caller?.id,
    });
    if (method !== "GET" || (table !== "analysis_targets" && table !== "reviews")) {
      return json(
        { message: `QA harness fake Supabase does not serve ${method} ${url.pathname}` },
        { status: 404 },
      );
    }
    const failure = failures.get(table);
    if (failure !== undefined) {
      return json({ message: "QA_HARNESS_PRIVATE_DB_DIAGNOSTIC" }, { status: failure });
    }

    let rows: Record<string, unknown>[] = tables[table] as unknown as Record<string, unknown>[];
    for (const [key, value] of url.searchParams) {
      if (value.startsWith("eq.")) rows = rows.filter((row) => String(row[key]) === value.slice(3));
    }
    rows = applyOrder(rows, url.searchParams.get("order"));
    const total = rows.length;
    const limit = url.searchParams.get("limit");
    if (limit !== null) rows = rows.slice(0, Number(limit));
    const columns = (url.searchParams.get("select") ?? "*").split(",");
    if (!columns.includes("*")) {
      rows = rows.map((row) => Object.fromEntries(columns.map((column) => [column, row[column]])));
    }
    const wantsCount = /count=exact/.test(headers.get("Prefer") ?? "");
    return json(structuredClone(rows), {
      headers: wantsCount
        ? { "Content-Range": rows.length ? `0-${rows.length - 1}/${total}` : `*/${total}` }
        : {},
    });
  };

  function storageFor(current: QaActor | null) {
    const items = new Map<string, string>();
    if (current) {
      const accessToken = tokenFor(current);
      actorsByToken.set(accessToken, current);
      items.set(
        STORAGE_KEY,
        JSON.stringify({
          access_token: accessToken,
          refresh_token: `qa-harness-refresh:${current.id}`,
          token_type: "bearer",
          expires_in: 3600,
          expires_at: SESSION_EXPIRES_AT,
          user: { id: current.id, aud: "authenticated", email: current.email },
        }),
      );
    }
    return {
      getItem: (key: string) => items.get(key) ?? null,
      setItem: (key: string, value: string) => void items.set(key, value),
      removeItem: (key: string) => void items.delete(key),
    };
  }

  return {
    tables,
    requests,
    get actor() {
      return actor;
    },
    signIn(next) {
      actor = next;
    },
    setAuthMode(mode) {
      authMode = mode;
    },
    failTable(table, status) {
      if (status === undefined) failures.delete(table);
      else failures.set(table, status);
    },
    client() {
      return createClient(FAKE_SUPABASE_URL, PUBLISHABLE_KEY, {
        auth: {
          storage: storageFor(actor),
          storageKey: STORAGE_KEY,
          persistSession: true,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
        global: { fetch: fetcher },
      });
    },
    clearRequests() {
      requests.length = 0;
    },
  };
}
