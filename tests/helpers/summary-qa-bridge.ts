import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { IngestionAttemptRow } from "@/services/ingestion/ingestion-attempt-repository";
import type { IngestionDependencies } from "@/services/ingestion/ingestion-lifecycle";

import { FAKE_SUPABASE_URL, type FakeSupabase, type ReviewRow } from "./qa-harness/fake-supabase";

/**
 * S2-002 bridge between the S2-006 review summary and the S2-003 fake Supabase.
 *
 * The S2-003 fake serves auth plus the `analysis_targets` and `reviews` tables only. The summary
 * path additionally calls the `get_review_summary` RPC and reads `latest_ingestion_attempts`, and
 * ingestion completes through the `finish_ingestion_attempt` RPC. This bridge adds exactly those,
 * computed over the SAME `fake.tables` rows the real Q&A context builder reads, so a summary and
 * a Q&A request in one test always come from one persisted dataset.
 *
 * Everything else (session verification, target lookups, review reads) still goes through the
 * unmodified S2-003 fake, so the real production code runs on both paths.
 *
 * SOURCE OF TRUTH: the emulations below mirror the SQL in
 *   supabase/migrations/20261113000000_create_review_summary.sql   (get_review_summary)
 *   supabase/migrations/20261107030000_bound_ingestion_completions.sql (finish_ingestion_attempt)
 * whose real behavior is verified against PostgreSQL by tests/db/review-summary.test.sql and
 * tests/db/ingestion-*.test.sql (`npm run test:db`). Tests using this bridge must assert against
 * hand-computed constants from the fixtures, never against values this bridge computes.
 */

const SUMMARY_RPC = "get_review_summary";
const ATTEMPT_RELATIONS = new Set(["latest_ingestion_attempts", "ingestion_attempts"]);
/** Error codes `finish_ingestion_attempt` accepts as terminal for a bound job. */
const TERMINAL_ERROR_CODES = new Set([
  "INGESTION_FAILED",
  "SOURCE_IDENTITY_UNVERIFIED",
  "NO_REVIEWS",
]);

export interface BridgeRequest {
  readonly resource: string;
  readonly actorId: string | undefined;
  readonly targetId: string | undefined;
}

export interface SummaryQaBridge {
  /** Ingestion attempts. Seed with `addAttempt`; `finish` updates them. */
  readonly attempts: IngestionAttemptRow[];
  /** Requests this bridge served (summary RPC and attempt reads), plus `finish` writes. */
  readonly requests: readonly BridgeRequest[];
  /** A session-scoped client like `createSupabaseServerClient()`, for direct service calls. */
  client(): SupabaseClient;
  addAttempt(
    overrides: Partial<IngestionAttemptRow> &
      Pick<IngestionAttemptRow, "analysis_target_id" | "owner_id">,
  ): IngestionAttemptRow;
  /** Makes the summary RPC fail with this HTTP status (undefined to clear). */
  failSummary(status: number | undefined): void;
  /** Emulated attempt writer for `reconcileIngestion`. Only `expireBound` and `finish` are used. */
  readonly writer: IngestionDependencies["writer"];
  clearRequests(): void;
}

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
  });

const notEmulated = (name: string) => async (): Promise<never> => {
  throw new Error(`summary-qa-bridge does not emulate writer.${name}`);
};

export function createSummaryQaBridge(fake: FakeSupabase): SummaryQaBridge {
  const attempts: IngestionAttemptRow[] = [];
  const requests: BridgeRequest[] = [];
  let summaryFailure: number | undefined;
  let attemptSequence = 0;
  let reviewSequence = 0;

  const ownsTarget = (actorId: string | undefined, targetId: unknown) =>
    actorId !== undefined &&
    fake.tables.analysis_targets.some((t) => t.id === targetId && t.owner_id === actorId);

  function localFetch(actorId: string | undefined): typeof fetch {
    return async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      const method = (init?.method ?? "GET").toUpperCase();

      if (url.pathname === `/rest/v1/rpc/${SUMMARY_RPC}` && method === "POST") {
        const targetId = (JSON.parse(String(init?.body ?? "{}")) as { p_target_id?: string })
          .p_target_id;
        requests.push({ resource: `rpc:${SUMMARY_RPC}`, actorId, targetId });
        if (summaryFailure !== undefined) {
          return json(
            { message: "SUMMARY_BRIDGE_PRIVATE_DB_DIAGNOSTIC" },
            { status: summaryFailure },
          );
        }
        // Mirrors: auth.uid() must own the target, else P0002 'Target unavailable'.
        if (!ownsTarget(actorId, targetId)) {
          return json({ code: "P0002", message: "Target unavailable" }, { status: 404 });
        }
        // Mirrors: select count(*), avg(rating) from reviews where analysis_target_id = p_target_id.
        const ratings = fake.tables.reviews
          .filter((row) => row.analysis_target_id === targetId)
          .map((row) => Number(row.rating));
        return json([
          {
            review_count: ratings.length,
            average_rating: ratings.length
              ? ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length
              : null,
          },
        ]);
      }

      const relation = /^\/rest\/v1\/([a-z_]+)$/.exec(url.pathname)?.[1];
      if (relation && ATTEMPT_RELATIONS.has(relation) && method === "GET") {
        const filters = [...url.searchParams].filter(([, value]) => value.startsWith("eq."));
        const targetFilter = url.searchParams.get("analysis_target_id");
        requests.push({
          resource: relation,
          actorId,
          targetId: targetFilter?.startsWith("eq.") ? targetFilter.slice(3) : undefined,
        });
        let rows = attempts.filter((row) =>
          filters.every(
            ([key, value]) =>
              String((row as unknown as Record<string, unknown>)[key]) === value.slice(3),
          ),
        );
        if (relation === "latest_ingestion_attempts") {
          // The view keeps only the newest attempt per target.
          const newest = new Map<string, IngestionAttemptRow>();
          for (const row of rows) {
            // Retained S3-005 audit rows have no visible parent and are not current datasets.
            if (!row.analysis_target_id) continue;
            const seen = newest.get(row.analysis_target_id);
            if (!seen || row.started_at > seen.started_at) newest.set(row.analysis_target_id, row);
          }
          rows = [...newest.values()];
        }
        const body = structuredClone(rows);
        const headers = new Headers(input instanceof Request ? input.headers : init?.headers);
        if (/vnd\.pgrst\.object/.test(headers.get("Accept") ?? "")) {
          return body.length === 1
            ? json(body[0])
            : json({ code: "PGRST116", message: "not one row" }, { status: 406 });
        }
        return json(body);
      }

      return json(
        { message: `summary-qa-bridge does not serve ${method} ${url.pathname}` },
        { status: 404 },
      );
    };
  }

  const writer: IngestionDependencies["writer"] = {
    reserve: notEmulated("reserve"),
    bind: notEmulated("bind"),
    expireUnbound: notEmulated("expireUnbound"),
    findForRecovery: notEmulated("findForRecovery"),
    async expireBound(attemptId, ownerId) {
      const attempt = attempts.find((row) => row.id === attemptId && row.owner_id === ownerId);
      if (!attempt) throw new Error("Target unavailable");
      return structuredClone(attempt);
    },
    // Mirrors finish_ingestion_attempt: owner + target ownership, idempotent after a terminal
    // state, only accepted terminal error codes, a failed attempt saves no reviews, and a
    // successful one inserts exactly the normalized rows it is given.
    async finish(attemptId, ownerId, reviews, skippedCount, identity, errorCode) {
      const attempt = attempts.find(
        (row) =>
          row.id === attemptId &&
          row.owner_id === ownerId &&
          ownsTarget(ownerId, row.analysis_target_id),
      );
      requests.push({
        resource: "rpc:finish_ingestion_attempt",
        actorId: ownerId,
        targetId: attempt?.analysis_target_id ?? undefined,
      });
      if (!attempt?.analysis_target_id) throw new Error("Target unavailable");
      if (attempt.status !== "processing") return structuredClone(attempt);
      if (
        attempt.provider_request_id !== null &&
        errorCode !== null &&
        !TERMINAL_ERROR_CODES.has(errorCode)
      ) {
        return structuredClone(attempt);
      }
      if (skippedCount < 0) throw new Error("Invalid completion");
      if (errorCode === null) {
        if (attempt.provider_request_id === null || reviews.length === 0 || identity === null) {
          throw new Error("Missing verified completion");
        }
        for (const review of reviews) {
          reviewSequence += 1;
          const n = String(reviewSequence).padStart(12, "0");
          const row: ReviewRow = {
            id: `3f000000-0000-4000-8000-${n}`,
            analysis_target_id: attempt.analysis_target_id,
            review_text: String(review.text),
            rating: Number(review.rating),
            source_review_id: (review.source_review_id as string | null) ?? null,
            reviewer_name: (review.reviewer_name as string | null) ?? null,
            review_date: (review.review_date as string | null) ?? null,
            review_url: (review.review_url as string | null) ?? null,
            source_metadata: (review.source_metadata as Record<string, unknown> | null) ?? null,
            created_at: `2026-11-15T10:00:${String(reviewSequence % 60).padStart(2, "0")}.000Z`,
          };
          fake.tables.reviews.push(row);
        }
      } else if (reviews.length !== 0) {
        throw new Error("Failed attempt cannot save reviews");
      }
      Object.assign(attempt, {
        status: errorCode === null ? "succeeded" : "failed",
        finished_at: "2026-11-15T10:01:00.000Z",
        saved_count: errorCode === null ? reviews.length : 0,
        skipped_count: skippedCount,
        verified_identity: identity,
        error_code: errorCode,
        identity_basis:
          errorCode === null
            ? attempt.query_kind === "place_id"
              ? "expected_place_id"
              : "provider_resolved"
            : null,
      } satisfies Partial<IngestionAttemptRow>);
      return structuredClone(attempt);
    },
  };

  return {
    attempts,
    requests,
    client() {
      const actorId = fake.actor?.id;
      const base = fake.client();
      const local = createClient(FAKE_SUPABASE_URL, "summary-qa-bridge-key", {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
          storageKey: "summary-qa-bridge",
        },
        global: { fetch: localFetch(actorId) },
      });
      const baseFrom = base.from.bind(base);
      const baseRpc = base.rpc.bind(base);
      // Route only the relations the S2-003 fake does not serve; everything else is unchanged.
      Object.assign(base, {
        from: (relation: string) =>
          ATTEMPT_RELATIONS.has(relation) ? local.from(relation) : baseFrom(relation),
        rpc: (fn: string, args?: Record<string, unknown>) =>
          fn === SUMMARY_RPC ? local.rpc(fn, args) : baseRpc(fn, args),
      });
      return base;
    },
    addAttempt(overrides) {
      attemptSequence += 1;
      const n = String(attemptSequence).padStart(12, "0");
      const row: IngestionAttemptRow = {
        id: `4a000000-0000-4000-8000-${n}`,
        source_url: "https://www.google.com/maps/place/Synthetic",
        submitted_query: "https://www.google.com/maps/place/Synthetic",
        query_kind: "source_url",
        expected_place_id: null,
        provider_request_id: `s2-002-job-${n}`,
        status: "processing",
        started_at: `2026-11-15T09:00:${String(attemptSequence % 60).padStart(2, "0")}.000Z`,
        finished_at: null,
        saved_count: 0,
        skipped_count: 0,
        error_code: null,
        identity_basis: null,
        verified_identity: null,
        ...overrides,
      };
      attempts.push(row);
      return row;
    },
    failSummary(status) {
      summaryFailure = status;
    },
    writer,
    clearRequests() {
      requests.length = 0;
    },
  };
}

/**
 * Creates the bridge and routes `createSupabaseServerClient()` to it. Call after the S2-003
 * harness is created (its `cleanup` resets the mock). Requires the harness preamble.
 */
export function installSummaryQaBridge(fake: FakeSupabase): SummaryQaBridge {
  const bridge = createSummaryQaBridge(fake);
  jest
    .mocked(createSupabaseServerClient)
    .mockImplementation(
      async () =>
        bridge.client() as unknown as Awaited<ReturnType<typeof createSupabaseServerClient>>,
    );
  return bridge;
}
