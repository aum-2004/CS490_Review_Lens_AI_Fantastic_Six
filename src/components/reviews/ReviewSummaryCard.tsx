import { IngestionStatus } from "@/components/ingestion/IngestionStatus";
import { Card } from "@/components/ui/Card";
import type { ReviewSummary } from "@/services/reviews/review-summary";

export interface ReviewSummaryCardProps {
  summary: ReviewSummary;
}

export function ReviewSummaryCard({ summary }: ReviewSummaryCardProps) {
  return (
    <Card aria-labelledby="review-summary-title" className="space-y-4">
      <div>
        <h2 id="review-summary-title" className="text-xl font-semibold">
          Review summary
        </h2>
        <p className="text-sm text-muted-foreground">Persisted reviews for this analysis target.</p>
      </div>
      <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <dt className="text-sm text-muted-foreground">Reviews saved</dt>
          <dd className="text-2xl font-semibold">{summary.reviewCount}</dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">Average rating</dt>
          <dd className="text-2xl font-semibold">
            {summary.averageRating === null
              ? "No ratings yet"
              : `${summary.averageRating.toFixed(1)} / 5`}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">Ingestion status</dt>
          <dd className="mt-1">
            <IngestionStatus
              state={summary.ingestionStatus}
              skippedCount={summary.skippedCount ?? undefined}
            />
          </dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">Skipped records</dt>
          <dd className="text-2xl font-semibold">{summary.skippedCount ?? "Unavailable"}</dd>
        </div>
      </dl>
    </Card>
  );
}
