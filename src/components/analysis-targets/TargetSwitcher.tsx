"use client";

import { useId, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/Button";

type TargetOption = { id: string; name: string; sourceUrl: string };

export function TargetSwitcher({
  activeTarget,
  targets,
}: {
  activeTarget: TargetOption;
  targets: TargetOption[] | null;
}) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  // Keep the current target identifiable even when it falls outside the bounded list.
  const options = targets && [activeTarget, ...targets.filter((t) => t.id !== activeTarget.id)];

  return (
    <div
      className="w-full space-y-3 sm:w-72"
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          event.preventDefault();
          setOpen(false);
          trigger.current?.focus();
        }
      }}
    >
      <Button
        ref={trigger}
        variant="outline"
        aria-label="Switch target"
        className="w-full justify-between"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen(!open)}
      >
        <span className="truncate">{activeTarget.name}</span>
        <span className="sr-only"> Switch target</span>
        <ChevronDown size={16} aria-hidden="true" />
      </Button>
      <nav id={listId} aria-label="Switch analysis target" hidden={!open}>
        {options ? (
          <>
            <ul className="max-h-64 space-y-2 overflow-y-auto rounded-lg border bg-card p-4">
              {options.map((target) => (
                <li key={target.id} className="min-w-0">
                  <Link
                    href={`/analysis-targets/${encodeURIComponent(target.id)}`}
                    prefetch={false}
                    aria-current={target.id === activeTarget.id ? "page" : undefined}
                    onClick={() => setOpen(false)}
                    className="block break-words rounded-sm text-sm underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    <span className="block">
                      {target.name}
                      {target.id === activeTarget.id && " (active)"}
                    </span>
                    <span className="block break-all text-xs text-muted-foreground">
                      {target.sourceUrl}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            {options.length === 1 && (
              <p className="mt-2 text-sm text-muted-foreground">You have no other targets yet.</p>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            We couldn&apos;t load your other targets. Open My Targets to try again.
          </p>
        )}
        <Button variant="ghost" asChild className="mt-2">
          <Link href="/analysis-targets" prefetch={false}>
            View all targets
          </Link>
        </Button>
      </nav>
    </div>
  );
}
