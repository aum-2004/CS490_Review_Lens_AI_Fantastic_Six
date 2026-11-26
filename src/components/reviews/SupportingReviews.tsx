import { useId } from "react";
import type { Citation } from "@/lib/qa/citations";
import { formatReviewText } from "@/lib/reviews/format-review-text";

const INLINE_REVIEW_COUNT = 3;

/** Numbered cited evidence, with access to the full cited set (S3-014, issue #120). */
export function SupportingReviews({ citations }: { citations: readonly Citation[] }) {
  const headingId = useId();
  if (citations.length === 0) return null;
  const hasMore = citations.length > INLINE_REVIEW_COUNT;
  return (
    <section aria-labelledby={headingId} className="space-y-2">
      <h4 id={headingId} className="font-medium">
        Supporting Reviews
      </h4>
      <p className="max-w-prose text-sm text-muted-foreground">
        These reviews were cited in this answer. They are not the complete saved review dataset.
      </p>
      <SupportingReviewList
        citations={citations.slice(0, INLINE_REVIEW_COUNT)}
        label="Supporting Reviews"
      />
      {hasMore && (
        <details className="space-y-3 rounded-lg border border-border p-3">
          <summary className="cursor-pointer rounded-sm text-sm font-medium text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            View all {citations.length} supporting reviews
          </summary>
          <p className="text-sm text-muted-foreground">
            Showing all {citations.length} cited reviews in citation order. The first three are also
            shown above.
          </p>
          <SupportingReviewList citations={citations} label="All supporting reviews" />
        </details>
      )}
    </section>
  );
}

function SupportingReviewList({
  citations,
  label,
}: {
  citations: readonly Citation[];
  label: string;
}) {
  return (
    <ol className="space-y-3" aria-label={label}>
      {citations.map(({ number, label, review }) => (
        <li key={number} className="max-w-prose space-y-1 text-sm">
          <p>
            <span className="font-medium">{label}</span>{" "}
            {review ? `${review.rating} out of 5` : "Review not available"}
          </p>
          {review && (
            <>
              <p className="whitespace-pre-wrap break-words">{formatReviewText(review.text)}</p>
              {review.reviewDate && (
                <p className="text-muted-foreground">
                  <time dateTime={review.reviewDate}>{review.reviewDate.slice(0, 10)}</time>
                </p>
              )}
            </>
          )}
        </li>
      ))}
    </ol>
  );
}
