import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import type { AnalysisTargetListItem } from "@/services/analysis-targets/list-analysis-targets";

const PLATFORM_LABELS: Record<AnalysisTargetListItem["platform"], string> = {
  google_maps: "Google Maps",
};

export function TargetCard({ target }: { target: AnalysisTargetListItem }) {
  return (
    <Card className="flex min-w-0 flex-col gap-4">
      <div>
        <h2 className="break-words text-xl font-semibold">{target.name}</h2>
        <span className="mt-2 inline-flex rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">
          {PLATFORM_LABELS[target.platform]}
        </span>
      </div>
      <div className="min-w-0">
        <p className="text-sm text-muted-foreground">Source</p>
        <a
          href={target.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          referrerPolicy="no-referrer"
          title={target.sourceUrl}
          className="block truncate rounded-sm text-sm underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring"
        >
          {target.sourceUrl}
        </a>
      </div>
      <Button variant="outline" asChild className="mt-auto self-start">
        <Link
          href={"/analysis-targets/" + encodeURIComponent(target.id)}
          prefetch={false}
          aria-label={"Open " + target.name}
        >
          Open
        </Link>
      </Button>
    </Card>
  );
}
