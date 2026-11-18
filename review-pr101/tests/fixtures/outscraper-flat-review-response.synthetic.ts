/**
 * Synthetic schema fixture based on the flat record field-name summary retained from a prior live
 * Outscraper inspection in ai-transcripts/2026-11-04_bansi_S1-020_chatgpt.md.
 *
 * The original request ID and payload are unavailable. Values below are synthetic, so this fixture
 * does not establish that live records contained review_id or that their IDs were distinct.
 */
export const outscraperFlatReviewResponseSynthetic = {
  id: "synthetic-request-id",
  status: "Success",
  data: [
    {
      author_title: null,
      google_id: "synthetic-business-google-id",
      name: "Synthetic business",
      place_id: "ChIJSyntheticBusiness001",
      review_id: "synthetic-review-id-001",
      review_link: null,
      review_rating: 5,
      review_text: null,
      review_timestamp: 1,
    },
    {
      author_title: null,
      google_id: "synthetic-business-google-id",
      name: "Synthetic business",
      place_id: "ChIJSyntheticBusiness001",
      review_id: "synthetic-review-id-002",
      review_link: null,
      review_rating: 4,
      review_text: null,
      review_timestamp: 2,
    },
  ],
};
