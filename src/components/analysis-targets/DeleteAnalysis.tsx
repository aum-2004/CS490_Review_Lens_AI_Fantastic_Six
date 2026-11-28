"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";

/** A full navigation discards cached workspaces, answers and sidebar entries after deletion. */
const returnToTargets = () => window.location.replace("/analysis-targets");

export function DeleteAnalysis({
  targetId,
  targetName,
  onDeleted = returnToTargets,
}: {
  targetId: string;
  targetName: string;
  onDeleted?: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const inFlight = useRef(false);
  const request = useRef<AbortController | null>(null);
  const titleId = useId();
  const descriptionId = useId();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useLayoutEffect(
    () => () => {
      request.current?.abort();
      request.current = null;
      inFlight.current = false;
      if (dialog.current?.open) dialog.current.close();
      setOpen(false);
      setPending(false);
      setError(null);
    },
    [],
  );
  useEffect(() => {
    if (open) {
      dialog.current?.showModal();
      cancel.current?.focus();
    }
  }, [open]);

  const close = () => {
    if (inFlight.current) return;
    dialog.current?.close();
    setOpen(false);
    setError(null);
    trigger.current?.focus();
  };
  const remove = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    const controller = new AbortController();
    request.current = controller;
    const timeout = setTimeout(() => controller.abort(), 30_000);
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/analysis-targets/${encodeURIComponent(targetId)}`, {
        method: "DELETE",
        credentials: "same-origin",
        cache: "no-store",
        signal: controller.signal,
      });
      // A missing/foreign target is no longer available to this workspace. Do not
      // parse an error body or claim deletion; discard the stale workspace instead.
      if (response.status === 404) {
        if (request.current === controller && !controller.signal.aborted) onDeleted();
        return;
      }
      const body: unknown = await response.json();
      if (
        !response.ok ||
        typeof body !== "object" ||
        body === null ||
        !("success" in body) ||
        body.success !== true ||
        !("data" in body) ||
        typeof body.data !== "object" ||
        body.data === null ||
        !("deleted" in body.data) ||
        body.data.deleted !== true
      ) {
        throw new Error("Deletion failed");
      }
      if (request.current === controller) onDeleted();
    } catch {
      if (request.current !== controller) return;
      setError("We couldn't delete this analysis. Please try again.");
      inFlight.current = false;
      setPending(false);
    } finally {
      clearTimeout(timeout);
    }
  };

  return (
    <>
      <Button ref={trigger} type="button" variant="destructive" onClick={() => setOpen(true)}>
        Delete analysis
      </Button>
      <dialog
        ref={dialog}
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="m-auto max-h-[90vh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-lg border border-border bg-card p-6 text-card-foreground shadow-xl backdrop:bg-black/60"
        onCancel={(event) => {
          event.preventDefault();
          close();
        }}
      >
        <h2 id={titleId} className="text-xl font-semibold">
          Delete analysis?
        </h2>
        <p id={descriptionId} className="my-4 break-words">
          Permanently delete “{targetName}” and its saved reviews? This cannot be undone. Ingestion
          audit records are retained for safety and usage limits.
        </p>
        {error && (
          <p role="alert" className="mb-4 text-destructive">
            {error}
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-3">
          <Button ref={cancel} type="button" variant="outline" disabled={pending} onClick={close}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" disabled={pending} onClick={remove}>
            {pending ? "Deleting…" : "Permanently delete"}
          </Button>
        </div>
        <p role="status" className="sr-only">
          {pending ? "Deleting analysis. Please wait." : ""}
        </p>
      </dialog>
    </>
  );
}
