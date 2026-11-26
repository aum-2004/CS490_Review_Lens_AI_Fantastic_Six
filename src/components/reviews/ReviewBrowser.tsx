"use client";

import { useMemo, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import {
  EMPTY_REVIEW_FILTERS,
  filterReviews,
  hasActiveReviewFilters,
  validateReviewFilters,
  type ReviewFilters,
} from "@/lib/reviews/filter-reviews";
import type { Review } from "@/services/reviews/review-service";
import { ReviewList } from "./ReviewList";

function displayFilters(filters: ReviewFilters): string[] {
  const labels: string[] = [];
  if (filters.minRating !== null) labels.push(`Min rating: ${filters.minRating}`);
  if (filters.maxRating !== null) labels.push(`Max rating: ${filters.maxRating}`);
  if (filters.startDate) labels.push(`From: ${filters.startDate}`);
  if (filters.endDate) labels.push(`Through: ${filters.endDate}`);
  return labels;
}

function numericValue(value: string): number | null {
  return value === "" ? null : Number(value);
}

export function ReviewBrowser({ reviews }: { reviews: Review[] }) {
  const [applied, setApplied] = useState<ReviewFilters>(EMPTY_REVIEW_FILTERS);
  const [draft, setDraft] = useState<ReviewFilters>(EMPTY_REVIEW_FILTERS);
  const [validationError, setValidationError] = useState<string | null>(null);
  const matchingReviews = useMemo(() => filterReviews(reviews, applied), [reviews, applied]);
  const active = hasActiveReviewFilters(applied);

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const error = validateReviewFilters(draft);
    if (error) {
      setValidationError(error);
      return;
    }
    setValidationError(null);
    setApplied({ ...draft });
  }

  function cancelDraft() {
    setDraft({ ...applied });
    setValidationError(null);
  }

  function clearAll() {
    setDraft({ ...EMPTY_REVIEW_FILTERS });
    setApplied({ ...EMPTY_REVIEW_FILTERS });
    setValidationError(null);
  }

  const filterLabels = displayFilters(applied);

  return (
    <section aria-label="Review browser" className="space-y-4">
      <Card className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">Review Preview</h2>
          <p aria-live="polite" className="text-sm font-medium">
            {matchingReviews.length} matching {matchingReviews.length === 1 ? "review" : "reviews"}
          </p>
        </div>
        <form onSubmit={applyFilters} className="space-y-4" aria-label="Review filters">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 [&>label]:grid-rows-[auto_1fr] [&>label]:content-end">
            <label className="space-y-1 text-sm font-medium" htmlFor="review-min-rating">
              Minimum rating
              <Input
                id="review-min-rating"
                type="number"
                min="1"
                max="5"
                step="any"
                value={draft.minRating ?? ""}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    minRating: numericValue(event.target.value),
                  }))
                }
              />
            </label>
            <label className="space-y-1 text-sm font-medium" htmlFor="review-max-rating">
              Maximum rating
              <Input
                id="review-max-rating"
                type="number"
                min="1"
                max="5"
                step="any"
                value={draft.maxRating ?? ""}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    maxRating: numericValue(event.target.value),
                  }))
                }
              />
            </label>
            <label className="space-y-1 text-sm font-medium" htmlFor="review-start-date">
              Start date
              <Input
                id="review-start-date"
                type="date"
                value={draft.startDate}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, startDate: event.target.value }))
                }
              />
            </label>
            <label className="space-y-1 text-sm font-medium" htmlFor="review-end-date">
              End date
              <Input
                id="review-end-date"
                type="date"
                value={draft.endDate}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, endDate: event.target.value }))
                }
              />
            </label>
          </div>
          {validationError && (
            <p role="alert" className="text-sm text-destructive">
              {validationError}
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" onClick={cancelDraft}>
              Cancel
            </Button>
            <Button type="button" variant="outline" onClick={clearAll}>
              Clear all
            </Button>
            <Button type="submit">Apply filters</Button>
          </div>
        </form>
        {active && (
          <div
            aria-label="Active filters"
            className="flex flex-wrap items-center gap-2 border-t border-border pt-3"
          >
            <span className="text-sm font-medium">Active filters:</span>
            {filterLabels.map((label) => (
              <span key={label} className="rounded-full bg-muted px-3 py-1 text-sm">
                {label}
              </span>
            ))}
          </div>
        )}
      </Card>
      {reviews.length === 0 ? (
        <ReviewList reviews={reviews} />
      ) : matchingReviews.length === 0 ? (
        <Card role="status">
          <h2 className="font-semibold">No reviews match these filters.</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Adjust your filters or clear them to see this target&apos;s saved reviews.
          </p>
        </Card>
      ) : (
        <ReviewList reviews={matchingReviews} />
      )}
    </section>
  );
}
