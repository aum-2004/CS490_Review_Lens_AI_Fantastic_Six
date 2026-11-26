/**
 * Citation display for grounded Q&A answers.
 *
 * The server (`parseQaModelReply`) is the only authority on whether a cited review ID belongs to
 * the active target's evidence. This module only:
 *   - bounds and dedupes the already-validated IDs before they leave the server,
 *   - checks that a client-received citation list is well formed (it never re-validates
 *     membership),
 *   - turns the IDs into numbered labels ([1], [2], ...) resolved against the reviews the
 *     workspace already loaded for the active target, so raw UUIDs are never displayed.
 *
 * Shared by the route (server) and the Q&A form (client); it must not import server-only code.
 */

/** Highest number of citations sent to or accepted by the client. Equals MAX_CONTEXT_REVIEWS. */
export const MAX_CITED_REVIEWS = 100;

const UUID_SOURCE = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const UUID_PATTERN = new RegExp(`^${UUID_SOURCE}$`, "i");
/** A UUID not embedded in a longer hex/dash run. */
const BOUNDED_UUID = `(?<![0-9a-f-])${UUID_SOURCE}(?![0-9a-f-])`;
/** `[id]`, `(id)`, `[id, id]` or `(id; id)`: a bracketed list of only UUIDs. */
const UUID_GROUP = new RegExp(
  `[\\[(]\\s*${BOUNDED_UUID}(?:\\s*[,;]\\s*${BOUNDED_UUID})*\\s*[\\])]`,
  "gi",
);
const ANY_UUID = new RegExp(BOUNDED_UUID, "gi");

/**
 * Server side: the citations to include in a successful response. `citedReviewIds` must already
 * be validated against the request's review IDs. Non-answers never carry citations.
 */
export function responseCitations(outcome: string, citedReviewIds: readonly unknown[]): string[] {
  if (outcome !== "answered") return [];
  const ids: string[] = [];
  for (const id of citedReviewIds) {
    if (typeof id === "string" && !ids.includes(id)) ids.push(id);
    if (ids.length === MAX_CITED_REVIEWS) break;
  }
  return ids;
}

/**
 * Client side: returns the citation list if it is well formed, otherwise `null` (fail closed).
 * Grounded answers require at least one citation; non-answers require none. Membership is not
 * checked here.
 */
export function parseCitedReviewIds(value: unknown, outcome: string): string[] | null {
  if (value === undefined) value = [];
  if (!Array.isArray(value) || value.length > MAX_CITED_REVIEWS) return null;
  const seen = new Set<string>();
  for (const id of value) {
    if (typeof id !== "string" || !UUID_PATTERN.test(id)) return null;
    const key = id.toLowerCase();
    if (seen.has(key)) return null;
    seen.add(key);
  }
  if (outcome === "answered" && value.length === 0) return null;
  // Declines and insufficient evidence are not grounded answers; citations contradict them.
  if (outcome !== "answered" && value.length > 0) return null;
  return [...value];
}

/** The fields needed to show a cited review. Text is always rendered as plain text. */
export type CitableReview = {
  id: string;
  analysisTargetId: string;
  rating: number;
  text: string;
  reviewDate: string | null;
};

export type Citation = {
  /** 1-based, in the server's citation order. */
  number: number;
  label: string;
  /** `null` when the review is not among the loaded active-target reviews. */
  review: CitableReview | null;
};

/**
 * Numbers the citations and replaces exactly those UUIDs in the answer text with their labels.
 * Reviews are matched only if they belong to `targetId`; anything else shows as unavailable.
 * UUID-looking strings that are not cited are left unchanged.
 */
export function buildCitationView(
  targetId: string,
  answer: string,
  citedReviewIds: readonly string[],
  reviews: readonly CitableReview[],
): { text: string; citations: Citation[] } {
  const activeReviews = new Map(
    reviews
      .filter((review) => review.analysisTargetId === targetId)
      .map((review) => [review.id.toLowerCase(), review]),
  );
  const labels = new Map<string, string>();
  const citations = citedReviewIds.map((id, index) => {
    const label = `[${index + 1}]`;
    labels.set(id.toLowerCase(), label);
    return { number: index + 1, label, review: activeReviews.get(id.toLowerCase()) ?? null };
  });
  if (labels.size === 0) return { text: answer, citations };

  const text = answer
    .replace(UUID_GROUP, (group) => {
      const ids = group.match(ANY_UUID) ?? [];
      const groupLabels = ids.map((id) => labels.get(id.toLowerCase()));
      // Rewrite the whole group only if every UUID in it is cited; otherwise fall through.
      return groupLabels.every(Boolean) ? groupLabels.join(", ") : group;
    })
    .replace(ANY_UUID, (id) => labels.get(id.toLowerCase()) ?? id);
  return { text, citations };
}
