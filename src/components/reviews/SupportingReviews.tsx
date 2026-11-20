import { useId } from "react";
import type { Citation } from "@/lib/qa/citations";
import { formatReviewText } from "@/lib/reviews/format-review-text";

/** Numbered evidence for a grounded answer. Review text is plain text; IDs are never shown. */
export function SupportingReviews({ citations }: { citations: readonly Citation[] }) {
  const headingId = useId();
  if (citations.length === 0) return null;
  return (
    <section aria-labelledby={headingId} className="space-y-2">
      <h4 id={headingId} className="font-medium">
        Supporting Reviews
      </h4>
      <ol className="space-y-3" aria-label="Supporting Reviews">
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
    </section>
  );
}
