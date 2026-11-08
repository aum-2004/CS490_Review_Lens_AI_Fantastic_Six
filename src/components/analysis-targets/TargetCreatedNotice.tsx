"use client";

import { useEffect } from "react";
import { Alert } from "@/components/ui/Alert";

/** Display-only handoff. Ownership is checked before this component is rendered. */
export function TargetCreatedNotice({
  created,
  canStart,
  completed,
}: {
  created: boolean;
  canStart: boolean;
  completed: boolean;
}) {
  useEffect(() => {
    if (!created) return;
    const url = new URL(window.location.href);
    if (!url.searchParams.has("created")) return;
    url.searchParams.delete("created");
    // Native history is integrated with Next.js and avoids a server navigation that
    // would immediately discard the notice. A reload no longer replays the marker.
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }, [created]);

  if (!created || completed) return null;
  return (
    <Alert role="status" aria-live="polite">
      <p className="max-w-prose">
        {canStart ? "Target created. You can now start ingestion." : "Target created."}
      </p>
    </Alert>
  );
}
