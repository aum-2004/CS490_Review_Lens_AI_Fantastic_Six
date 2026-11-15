"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/shared/Spinner";
import { ErrorAlert } from "@/components/shared/ErrorAlert";
import { IngestionStatus } from "./IngestionStatus";
import { ingestionErrorMessage, type IngestionSummary } from "@/services/ingestion/ingestion-state";

const POLL_INTERVAL_MS = 5000;
const MAX_AUTOMATIC_RETRIES = 2;

export function IngestionPanel({
  targetId,
  targetName,
  summary,
  onSummary,
  onPendingChange,
  unavailableReason,
}: {
  targetId: string;
  targetName: string;
  summary: IngestionSummary | null;
  onSummary: (summary: IngestionSummary) => void;
  onPendingChange: (pending: boolean) => void;
  unavailableReason: string | null;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pollFailed, setPollFailed] = useState(false);
  const submitting = useRef(false);
  const endpoint = `/api/analysis-targets/${encodeURIComponent(targetId)}/ingestion`;

  useEffect(() => {
    if (summary?.state !== "processing" || pollFailed) return;
    let active = true;
    let failures = 0;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const response = await fetch(`${endpoint}/refresh`, { method: "POST" });
        if (!active) return;
        if (response.status === 401) {
          router.replace(`/login?next=${encodeURIComponent(`/analysis-targets/${targetId}`)}`);
          return;
        }
        const result = await response.json();
        if (!response.ok || result.success !== true || !isSummary(result.data))
          throw new Error(ingestionErrorMessage(result.error?.code));
        if (!active) return;
        onSummary(result.data);
        failures = 0;
        setError(null);
        if (result.data.state !== "processing") router.refresh();
        else timer = setTimeout(poll, POLL_INTERVAL_MS);
      } catch (error) {
        if (active) {
          setError(
            error instanceof Error && responseErrorMessages.has(error.message)
              ? error.message
              : "We couldn't refresh the ingestion status. Please try again.",
          );
          failures++;
          if (failures <= MAX_AUTOMATIC_RETRIES) {
            timer = setTimeout(poll, POLL_INTERVAL_MS * 2 ** failures);
          } else setPollFailed(true);
        }
      }
    }
    timer = setTimeout(poll, POLL_INTERVAL_MS);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [summary?.state, pollFailed, endpoint, targetId, onSummary, router]);

  async function performAction() {
    if (submitting.current) return;
    submitting.current = true;
    setPending(true);
    onPendingChange(true);
    setError(null);
    const refreshing = !summary || summary.state === "processing";
    try {
      const response = await fetch(
        refreshing ? (summary ? `${endpoint}/refresh` : endpoint) : endpoint,
        { method: refreshing && !summary ? "GET" : "POST" },
      );
      if (response.status === 401) {
        router.replace(`/login?next=${encodeURIComponent(`/analysis-targets/${targetId}`)}`);
        return;
      }
      if (response.status === 404) {
        setError("This target isn't available to your account. Go back to My Targets.");
        return;
      }
      const result = await response.json();
      if (!response.ok || result.success !== true || !isSummary(result.data)) {
        setError(ingestionErrorMessage(result.error?.code));
        return;
      }
      onSummary(result.data);
      setPollFailed(false);
      if (result.data.state !== "processing") router.refresh();
    } catch {
      setError("We couldn't reach ReviewLens. Please try again.");
    } finally {
      submitting.current = false;
      setPending(false);
      onPendingChange(false);
    }
  }

  const processing = summary?.state === "processing";
  const recovering = !summary || (processing && pollFailed);
  return (
    <Card id="ingestion" className="space-y-4">
      <h2 className="text-xl font-semibold">Ingestion</h2>
      {pending ? (
        <p role="status">{recovering ? "Loading ingestion status…" : "Starting ingestion..."}</p>
      ) : (
        <div role="status" aria-atomic="true">
          <IngestionStatus state={summary?.state ?? null} skippedCount={summary?.skippedCount} />
        </div>
      )}
      {processing ? (
        <p role="status" className="max-w-prose break-words">
          Collecting reviews for {targetName} from Google Maps…
        </p>
      ) : (
        <p className="max-w-prose break-words text-muted-foreground">
          Collect reviews for {targetName} from the saved Google Maps source.
        </p>
      )}
      {summary?.state === "succeeded" && !pending && (
        <p role="status" className="max-w-prose">
          Last completed run: {summary.savedCount} reviews saved.{" "}
          {summary.skippedCount > 0
            ? `${summary.skippedCount} unusable records were skipped.`
            : "0 records were skipped."}
        </p>
      )}
      {summary?.state === "succeeded" && summary.skippedCount > 0 && !pending && (
        <p className="max-w-prose text-sm text-muted-foreground">
          Ingestion partially succeeded for {targetName}. Only saved reviews are included in this
          target&apos;s dataset.
        </p>
      )}
      {summary?.state === "failed" && !pending && (
        <ErrorAlert message={ingestionErrorMessage(summary.errorCode)} />
      )}
      {summary?.state === "succeeded" &&
        summary.identityBasis === "provider_resolved" &&
        !pending && (
          <p className="max-w-prose break-words text-sm text-muted-foreground">
            The review service identified this business as {summary.providerBusinessName}. This
            identity has not been independently matched to the saved link.
          </p>
        )}
      {!summary && !error && (
        <ErrorAlert message="We couldn't load the ingestion status. Try again before starting collection." />
      )}
      {error && <ErrorAlert message={error} />}
      <Button
        onClick={performAction}
        disabled={
          pending ||
          summary?.state === "succeeded" ||
          summary?.errorCode === "RESULT_WINDOW_EXPIRED" ||
          summary?.errorCode === "SUBMISSION_UNCERTAIN" ||
          (!recovering && (processing || !!unavailableReason))
        }
        className="min-w-48"
      >
        {pending && <Spinner />}
        {pending
          ? recovering
            ? "Loading…"
            : "Starting ingestion..."
          : summary?.state === "succeeded"
            ? "Ingestion complete"
            : recovering || summary?.state === "failed"
              ? "Try again"
              : "Start ingestion"}
      </Button>
      {summary?.state === "succeeded" && (
        <p className="max-w-prose text-sm text-muted-foreground">
          Reviews have already been ingested for this target. Further collection is unavailable.
        </p>
      )}
      {unavailableReason && (
        <p className="max-w-prose text-sm text-muted-foreground">{unavailableReason}</p>
      )}
      {summary?.startedAt && (
        <p className="text-sm text-muted-foreground">
          Last started:{" "}
          <time dateTime={summary.startedAt}>
            {summary.startedAt.replace("T", " ").replace("Z", " UTC")}
          </time>
        </p>
      )}
      {summary?.finishedAt && (
        <p className="text-sm text-muted-foreground">
          Finished:{" "}
          <time dateTime={summary.finishedAt}>
            {summary.finishedAt.replace("T", " ").replace("Z", " UTC")}
          </time>
        </p>
      )}
    </Card>
  );
}

function isSummary(value: unknown): value is IngestionSummary {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return (
    ["not_ingested", "processing", "succeeded", "failed"].includes(String(row.state)) &&
    typeof row.savedCount === "number" &&
    typeof row.skippedCount === "number" &&
    (row.identityBasis === null ||
      row.identityBasis === "expected_place_id" ||
      row.identityBasis === "provider_resolved") &&
    (row.providerBusinessName === null || typeof row.providerBusinessName === "string") &&
    (row.identityBasis !== "provider_resolved" ||
      (typeof row.providerBusinessName === "string" && row.providerBusinessName.trim().length > 0))
  );
}
const responseErrorMessages = new Set(
  [
    "PROVIDER_TIMEOUT",
    "PROVIDER_QUOTA",
    "PROVIDER_UNAVAILABLE",
    "INGESTION_FAILED",
    "RESULT_LOOKUP_UNAVAILABLE",
    "INGESTION_RESULT_LIMIT",
  ].map(ingestionErrorMessage),
);
