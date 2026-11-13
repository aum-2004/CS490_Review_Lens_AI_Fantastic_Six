"use client";

import { useState } from "react";
import type { IngestionSummary } from "@/services/ingestion/ingestion-state";
import { IngestionStatus } from "./IngestionStatus";
import { IngestionPanel } from "./IngestionPanel";
import { TargetCreatedNotice } from "@/components/analysis-targets/TargetCreatedNotice";

export function WorkspaceIngestion({
  targetId,
  targetName,
  sourceUrl,
  initialSummary,
  unavailableReason,
  created = false,
}: {
  targetId: string;
  targetName: string;
  sourceUrl: string;
  initialSummary: IngestionSummary | null;
  unavailableReason: string | null;
  created?: boolean;
}) {
  const [summary, setSummary] = useState(initialSummary);
  const [pending, setPending] = useState(false);
  const canStart =
    !pending &&
    !unavailableReason &&
    !!summary &&
    (summary.state === "not_ingested" ||
      (summary.state === "failed" &&
        !["SUBMISSION_UNCERTAIN", "RESULT_WINDOW_EXPIRED"].includes(summary.errorCode ?? "")));
  return (
    <>
      <TargetCreatedNotice
        created={created}
        canStart={canStart}
        completed={summary?.state === "succeeded"}
      />
      <div className="min-w-0 space-y-3">
        <span className="inline-flex rounded-full bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
          Google Maps
        </span>
        <p className="break-all text-sm">
          <span className="text-muted-foreground">Source: </span>
          <a
            href={sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            referrerPolicy="no-referrer"
            className="rounded-sm underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring"
          >
            {sourceUrl}
          </a>
        </p>
        {pending ? (
          <p role="status">Updating ingestion…</p>
        ) : (
          <IngestionStatus state={summary?.state ?? null} skippedCount={summary?.skippedCount} />
        )}
      </div>
      <IngestionPanel
        targetId={targetId}
        targetName={targetName}
        summary={summary}
        onSummary={setSummary}
        onPendingChange={setPending}
        unavailableReason={unavailableReason}
      />
    </>
  );
}
