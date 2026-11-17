"use client";

import { useState } from "react";
import type { IngestionSummary } from "@/services/ingestion/ingestion-state";
import { IngestionPanel } from "./IngestionPanel";
import { TargetCreatedNotice } from "@/components/analysis-targets/TargetCreatedNotice";
import { Card } from "@/components/ui/Card";

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
      <Card className="space-y-3">
        <p className="text-[11px] font-bold uppercase tracking-[1.5px] text-muted-foreground">
          Review collection
        </p>
        <h2 className="break-words text-lg font-semibold">{targetName}</h2>
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
      </Card>
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
