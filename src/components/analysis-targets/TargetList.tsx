import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/shared/EmptyState";
import type { AnalysisTargetListItem } from "@/services/analysis-targets/list-analysis-targets";
import { TargetCard } from "./TargetCard";
import { MAX_TARGETS } from "@/services/analysis-targets/list-limits";

export function TargetList({ targets }: { targets: AnalysisTargetListItem[] }) {
  if (targets.length === 0) {
    return (
      <EmptyState
        title="No targets yet"
        description="You haven't created any targets yet. Create your first target to get started."
        action={
          <Button asChild>
            <Link href="/analysis-targets/new" prefetch={false}>
              Create your first target
            </Link>
          </Button>
        }
      />
    );
  }
  return (
    <>
      {targets.length >= MAX_TARGETS && (
        <p className="mb-4 text-sm text-muted-foreground">
          Showing your first {MAX_TARGETS} targets, newest first.
        </p>
      )}
      <ul aria-label="Your analysis targets" className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {targets.map((target) => (
          <li key={target.id} className="flex min-w-0 [&>section]:w-full">
            <TargetCard target={target} />
          </li>
        ))}
      </ul>
    </>
  );
}
