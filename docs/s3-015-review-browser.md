# S3-015 Complete Review Dataset Browser

## Requirement gap analysis

The production behavior required by S3-015 already exists on `main`:

- `ProtectedTargetWorkspace` authenticates the page request, verifies ownership of the active
  `AnalysisTarget`, and only then requests its child reviews.
- `createSupabaseReviewStore().listReviews()` scopes every page to the active target, orders rows
  by `(created_at, id)`, and continues until the server returns an empty page. This avoids silent
  truncation even when Supabase returns fewer rows than the requested page size.
- A failure on any page rejects the complete read. `ProtectedTargetWorkspace` renders a review-load
  error for that result rather than passing an empty array to `ReviewList`.
- `ReviewList` maps the complete returned array without slicing it. It displays each persisted
  rating and full review text, plus reviewer name and source date only when present.
- Review text is rendered as an escaped React text child after the existing display-only `<br>`
  conversion. The component does not use raw HTML rendering.
- Existing workspace, target-switching, service, route, database, and RLS tests already cover
  empty and failed reads, current-target replacement, ownership checks, and cross-user isolation.

No production behavior or schema change was necessary. The missing evidence was a focused UI test
that proves the browser itself renders every item in a dataset beyond the normal 1,000-row backend
page boundary while preserving optional fields and the empty state. S3-015 adds that regression
coverage in `tests/unit/components/reviews/ReviewList.test.tsx`.

## Requirement and evidence matrix

| Requirement                                   | Implementation                                                                                            | Verification                                                                                                                              |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Browse the complete current persisted dataset | The workspace passes the complete `listReviews` result directly to `ReviewList`; the list maps every item | S3-015 component test renders 1,001 records and asserts the first and last items; store tests cover multiple pages and a lower server cap |
| Rating and complete review text               | `ReviewList` renders `review.rating` and the complete formatted `review.text`                             | S3-015 component test checks a fractional rating and long multiline text exactly                                                          |
| Optional reviewer and date                    | Conditional reviewer text and semantic `<time>` output                                                    | S3-015 component tests cover present and absent metadata without placeholders                                                             |
| No silent partial result                      | Store rejects any failed page; workspace keeps `reviews` as `null` and shows an error                     | Existing store and workspace regression tests                                                                                             |
| Meaningful empty result                       | Empty array renders "No saved reviews yet" with an ingestion-status link                                  | S3-015 component test and existing workspace tests                                                                                        |
| Active-target isolation                       | Ownership is checked before child reads; every page includes `analysis_target_id = targetId`              | Existing ownership, store query-shape, target-switching, route, Playwright, and database RLS tests                                        |
| Safe untrusted text                           | React text rendering plus the existing display-only line-break formatter                                  | Existing malicious HTML component regression test                                                                                         |

GitHub issue #121 references S3-BR-023 and S3-BR-024. Their canonical definitions are not present
in the repository or other searchable project materials, so this work traces to the issue text and
does not invent rule definitions.

## Pagination and completeness

`REVIEW_PAGE_SIZE` is 1,000, but it is only a requested page size. The next offset is the number of
rows actually returned, not the requested size. Therefore a project-level Supabase cap below 1,000
does not skip rows. Stable ordering by creation time and Review ID makes successive range queries
deterministic. An empty page is the only successful termination condition, and any database error
fails the entire operation.

The UI intentionally has no separate limit: it renders the complete result. S3-016 may add filters
and pagination or incremental loading, but those controls must operate over this same complete,
target-scoped dataset and retain the no-partial-success rule.

## Security and integration boundaries

- The authenticated identity comes from the verified Supabase session.
- Parent ownership is checked before review retrieval, and the session-scoped client keeps RLS
  active as defense in depth.
- Review queries remain constrained to one `AnalysisTarget`; no service-role client is used.
- Browsing is read-only and does not mutate reviews, targets, ingestion state, or Q&A state.
- No database migration, dependency, paid API, OpenAI request, or Outscraper request is required.
- S3-016 filtering is deliberately not implemented. Its owner can reuse `ReviewList` and the
  complete `Review[]` input without undoing S3-015 behavior.
- Refresh stories may later define which successful ingestion run is current. S3-015 does not
  speculate about run identity; it displays the review rows currently associated with the active
  target under the existing persistence contract.
