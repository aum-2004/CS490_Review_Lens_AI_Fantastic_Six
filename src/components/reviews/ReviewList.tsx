import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/shared/EmptyState";
import type { Review } from "@/services/reviews/review-service";

export function ReviewList({ reviews }: { reviews: Review[] }) {
  if (reviews.length === 0) {
    return (
      <EmptyState
        title="Reviews"
        description="No saved reviews yet."
        action={
          <Button asChild>
            <a href="#ingestion">View ingestion status</a>
          </Button>
        }
      />
    );
  }
  return (
    <Card className="space-y-4">
      <h2 className="text-xl font-semibold">Reviews</h2>
      <ul aria-label="Saved reviews" className="space-y-4">
        {reviews.map((review) => (
          <li
            key={review.id}
            className="space-y-2 border-b border-border pb-4 last:border-0 last:pb-0"
          >
            <p className="font-medium">{review.rating} out of 5</p>
            <p className="max-w-prose whitespace-pre-wrap break-words">{review.text}</p>
            {review.reviewerName && (
              <p className="max-w-prose break-words text-sm text-muted-foreground">
                {review.reviewerName}
              </p>
            )}
            {review.reviewDate && (
              <p className="text-sm text-muted-foreground">
                <time dateTime={review.reviewDate}>{review.reviewDate.slice(0, 10)}</time>
              </p>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
