import { IngestionStatus } from "@/components/ingestion/IngestionStatus";
import { Card } from "@/components/ui/Card";
import type { ReviewSummary } from "@/services/reviews/review-summary";

export interface ReviewSummaryCardProps {
  summary: ReviewSummary;
  targetName: string;
}

export function ReviewSummaryCard({ summary, targetName }: ReviewSummaryCardProps) {
  return (
    <Card aria-labelledby="review-summary-title" className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 id="review-summary-title" className="text-lg font-semibold">
          Review summary
        </h2>
        <p className="break-words text-sm text-muted-foreground">
          Active target: <span className="font-medium text-foreground">{targetName}</span> · Google
          Maps. Summary of this target&apos;s persisted reviews.
        </p>
        <div className="text-xs">
          <p className="sr-only">Ingestion status</p>
          <div className="mt-1">
            <IngestionStatus
              state={summary.ingestionStatus}
              skippedCount={summary.skippedCount ?? undefined}
            />
          </div>
        </div>
      </div>
      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3 sm:[&>div+div]:border-l sm:[&>div+div]:border-border sm:[&>div+div]:pl-4">
        <div>
          <dt className="text-sm text-muted-foreground">Reviews saved</dt>
          <dd className="mt-1 text-3xl font-semibold tracking-tight">{summary.reviewCount}</dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">Average rating</dt>
          <dd className="mt-1 text-3xl font-semibold tracking-tight">
            {summary.averageRating === null
              ? "No ratings yet"
              : `${summary.averageRating.toFixed(1)} / 5`}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">Skipped records</dt>
          <dd className="mt-1 text-3xl font-semibold tracking-tight">
            {summary.skippedCount ?? "Unavailable"}
          </dd>
        </div>
      </dl>
    </Card>
  );
}
