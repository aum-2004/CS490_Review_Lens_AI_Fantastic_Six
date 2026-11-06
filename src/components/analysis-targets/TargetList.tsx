import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import type { AnalysisTargetListItem } from "@/services/analysis-targets/list-analysis-targets";
import { TargetCard } from "./TargetCard";

export function TargetList({ targets }: { targets: AnalysisTargetListItem[] }) {
  if (targets.length === 0) {
    return (
      <Card className="flex flex-col items-start gap-4">
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="size-8 text-muted-foreground"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <path d="M14 17.5h7M17.5 14v7" />
        </svg>
        <h2 className="text-xl font-semibold">No targets yet</h2>
        <p className="text-muted-foreground">
          You haven&apos;t created any targets yet. Create your first target to get started.
        </p>
        <Button asChild>
          <Link href="/analysis-targets/new" prefetch={false}>
            Create your first target
          </Link>
        </Button>
      </Card>
    );
  }
  return (
    <ul aria-label="Your analysis targets" className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
      {targets.map((target) => (
        <li key={target.id} className="flex min-w-0 [&>section]:w-full">
          <TargetCard target={target} />
        </li>
      ))}
    </ul>
  );
}
