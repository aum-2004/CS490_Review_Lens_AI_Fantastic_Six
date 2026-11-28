"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/shared/Spinner";
import { ErrorAlert } from "@/components/shared/ErrorAlert";
import { ingestionErrorMessage, type IngestionSummary } from "@/services/ingestion/ingestion-state";
import {
  reingestErrorMessage,
  type ReingestBaseline,
} from "@/services/ingestion/ingestion-reingest-state";
import { useWorkspaceIngestion } from "./WorkspaceIngestionState";
import { useLatestRequest } from "./useLatestRequest";

const HOLDS = ["SUBMISSION_UNCERTAIN", "RESULT_WINDOW_EXPIRED"];

function formatTime(value: string) {
  return value.replace("T", " ").replace("Z", " UTC");
}

function isSummary(value: unknown): value is IngestionSummary {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return (
    ["not_ingested", "processing", "succeeded", "failed"].includes(String(row.state)) &&
    typeof row.savedCount === "number" &&
    typeof row.skippedCount === "number"
  );
}

function reviewsLabel(count: number) {
  return `${count} ${count === 1 ? "review" : "reviews"}`;
}

/**
 * S3-009 refresh control. It shares the workspace ingestion state, so a started refresh is polled
 * by the Ingestion panel, and the review list and questions keep using the saved reviews meanwhile.
 * baseline: the last successful attempt; null = nothing collected yet; undefined = couldn't load.
 */
export function ReingestReviews({
  userId,
  targetId,
  targetName,
  reviewCount,
  baseline,
  unavailableReason,
}: {
  userId: string;
  targetId: string;
  targetName: string;
  reviewCount: number | null;
  baseline: ReingestBaseline | null | undefined;
  unavailableReason: string | null;
}) {
  const router = useRouter();
  const { summary, setSummary, pending: workspacePending, setPending } = useWorkspaceIngestion();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [started, setStarted] = useState(false);
  const headingId = useId();
  const helpId = useId();

  // A response can arrive after the user left this workspace (unmount or Activity hide) or after
  // the target or account changed. Only the newest request of the current, visible scope may
  // navigate, update shared state, or clear its own pending state. On restore after an abandoned
  // request, the hook reloads the persisted status (the Ingestion panel then polls a running one).
  const beginRequest = useLatestRequest(`${userId}:${targetId}`, (abandoned) => {
    if (abandoned) setPending(false);
    setSubmitting(false);
    setError(null);
    setStarted(false);
  });

  if (baseline === null) return null;

  const refreshing = summary?.state === "processing";
  const held = summary?.state === "failed" && HOLDS.includes(summary.errorCode ?? "");
  // With a successful baseline, a failed latest attempt is a refresh that came after it.
  const lastRefreshFailed = !!baseline && summary?.state === "failed" && !held;
  const completed = started && summary?.state === "succeeded";
  const disabled =
    submitting ||
    workspacePending ||
    refreshing ||
    held ||
    !!unavailableReason ||
    !baseline ||
    !summary;

  async function refresh() {
    const request = beginRequest();
    if (!request) return;
    const { current } = request;
    setSubmitting(true);
    setPending(true);
    setError(null);
    setStarted(false);
    try {
      const response = await fetch(
        `/api/analysis-targets/${encodeURIComponent(targetId)}/ingestion/reingest`,
        {
          method: "POST",
          credentials: "same-origin",
          cache: "no-store",
          signal: request.signal,
        },
      );
      if (!current()) return;
      if (response.status === 401) {
        router.replace(`/login?next=${encodeURIComponent(`/analysis-targets/${targetId}`)}`);
        return;
      }
      if (response.status === 404) {
        setError("This target isn't available to your account. Go back to My Targets.");
        return;
      }
      const result = await response.json().catch(() => null);
      if (!current()) return;
      if (!response.ok || result?.success !== true || !isSummary(result.data)) {
        const code = typeof result?.error?.code === "string" ? result.error.code : null;
        setError(reingestErrorMessage(code ?? "REINGEST_START_FAILED"));
        // Another tab may have started a refresh: load it so the workspace shows and polls it.
        if (code === "REINGEST_IN_PROGRESS") router.refresh();
        return;
      }
      setSummary(result.data);
      setStarted(true);
      if (result.data.state !== "processing") router.refresh();
    } catch {
      // An abort after leaving (AbortError) is not a failure: no banner for a stale request.
      if (!current()) return;
      setError("We couldn't reach ReviewLens. Please try again.");
    } finally {
      // Cleanup already reset a stale request; never clear a newer request's pending state.
      if (request.release()) {
        setSubmitting(false);
        setPending(false);
      }
    }
  }

  const count = reviewCount === null ? null : reviewsLabel(reviewCount);
  return (
    <Card aria-labelledby={headingId} className="space-y-3">
      <h2 id={headingId} className="text-xl font-semibold">
        Refresh reviews
      </h2>
      <p className="max-w-prose break-words text-sm">
        {count ? (
          <>
            Current dataset: <span className="font-medium">{count}</span>.{" "}
          </>
        ) : null}
        It is the deduplicated union of every review collected for {targetName} so far.
      </p>
      <p id={helpId} className="max-w-prose text-sm text-muted-foreground">
        Refreshing fetches newer reviews and merges them in. Reviews already collected stay in the
        dataset even when a later response doesn&apos;t include them, and a refresh that fails
        changes nothing.
      </p>
      {baseline ? (
        <dl className="grid gap-x-3 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
          <dt className="text-muted-foreground">Last successful collection</dt>
          <dd>
            {baseline.finishedAt ? (
              <time dateTime={baseline.finishedAt}>{formatTime(baseline.finishedAt)}</time>
            ) : (
              "Unavailable"
            )}
          </dd>
          <dt className="text-muted-foreground">New reviews it added</dt>
          <dd>{reviewsLabel(baseline.savedCount)}</dd>
        </dl>
      ) : (
        <p className="max-w-prose text-sm text-muted-foreground">
          We couldn&apos;t load the refresh details for this analysis. Reload the workspace to try
          again.
        </p>
      )}
      <div role="status" aria-atomic="true" className="max-w-prose break-words text-sm">
        {refreshing
          ? `Refreshing reviews for ${targetName}… ${
              count ? `The ${count} already collected stay` : "Reviews already collected stay"
            } available for browsing and questions.`
          : completed
            ? `Refresh complete. ${reviewsLabel(summary.savedCount)} new to this analysis ${
                summary.savedCount === 1 ? "was" : "were"
              } added; reviews already collected were kept.`
            : null}
      </div>
      {lastRefreshFailed && (
        <ErrorAlert
          message={`The last refresh didn't finish. ${ingestionErrorMessage(summary.errorCode)} Your previously collected reviews are unchanged.`}
        />
      )}
      {held && (
        <p className="max-w-prose text-sm text-muted-foreground">
          {reingestErrorMessage("REINGEST_BLOCKED")}
        </p>
      )}
      {error && <ErrorAlert message={error} />}
      <Button
        onClick={refresh}
        disabled={disabled}
        aria-describedby={helpId}
        className="w-full sm:w-auto sm:min-w-48"
      >
        {(submitting || refreshing) && <Spinner />}
        {submitting
          ? "Starting refresh…"
          : refreshing
            ? "Refreshing…"
            : error || lastRefreshFailed
              ? "Retry refresh"
              : "Refresh reviews"}
      </Button>
      {/* The Ingestion panel already states the reason; repeating it would duplicate that copy. */}
      {unavailableReason && (
        <p className="max-w-prose text-sm text-muted-foreground">
          Refreshing is paused until review collection is available again. The Ingestion panel
          explains why.
        </p>
      )}
    </Card>
  );
}
