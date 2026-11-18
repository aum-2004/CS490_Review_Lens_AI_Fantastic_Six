import { getExtractedReviews } from "@/services/ingestion/outscraper-service";
import { getOutscraperResult } from "@/services/ingestion/outscraper-client";

jest.mock("@/services/ingestion/outscraper-client", () => ({
  ...jest.requireActual("@/services/ingestion/outscraper-client"),
  getOutscraperResult: jest.fn(),
}));

const mockGetResult = jest.mocked(getOutscraperResult);

describe("Outscraper ingestion service", () => {
  const placeId = "ChIJi9xEDhlZwokRZXXlcZ6Ubkw";

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns pending while extraction is running", async () => {
    mockGetResult.mockResolvedValue({
      status: "pending",
    });

    const result = await getExtractedReviews("test-request-1", placeId);

    expect(result).toEqual({
      status: "pending",
    });

    expect(mockGetResult).toHaveBeenCalledWith("test-request-1", placeId, undefined);
  });

  it("maps completed reviews into Deep's format", async () => {
    mockGetResult.mockResolvedValue({
      status: "completed",
      businessName: "Cortaditos",
      placeId,
      identity: { placeId, businessName: "Cortaditos" },
      reviews: [
        {
          review_text: "Great coffee!",
          review_rating: 5,
          review_id: "test-001",
          author_title: "Test Reviewer",
          review_timestamp: 1793481600,
          review_link: "https://example.com/review/001",
        },
      ],
    });

    const result = await getExtractedReviews("test-request-1", placeId);

    expect(result).toMatchObject({
      status: "completed",
      businessName: "Cortaditos",
      placeId,
      identity: { placeId, businessName: "Cortaditos" },
      reviews: [
        {
          text: "Great coffee!",
          rating: 5,
          sourceReviewId: "test-001",
          reviewerName: "Test Reviewer",
          reviewUrl: "https://example.com/review/001",
          metadata: {
            platform: "google_maps",
            provider: "outscraper",
            placeId,
          },
        },
      ],
    });

    if (result.status === "completed") {
      expect(result.reviews[0].reviewDate).toBe(new Date(1793481600 * 1000).toISOString());
    }
  });

  it("inherits the verified Place ID when a review omits it", async () => {
    mockGetResult.mockResolvedValue({
      status: "completed",
      businessName: "Cortaditos",
      placeId,
      identity: { placeId, businessName: "Cortaditos" },
      reviews: [{ review_text: "Great coffee!", review_rating: 5 }],
    });

    const result = await getExtractedReviews("test-request-1", placeId);

    expect(result).toMatchObject({
      status: "completed",
      reviews: [{ metadata: { placeId } }],
    });
  });

  it("rejects a review with an explicit conflicting Place ID", async () => {
    mockGetResult.mockResolvedValue({
      status: "completed",
      businessName: "Cortaditos",
      placeId,
      identity: { placeId, businessName: "Cortaditos" },
      reviews: [
        {
          place_id: "ChIJDifferentPlace",
          review_text: "Great coffee!",
          review_rating: 5,
        },
      ],
    });

    await expect(getExtractedReviews("test-request-1", placeId)).rejects.toMatchObject({
      code: "BUSINESS_MISMATCH",
    });
  });

  it("rejects reviews with missing required fields", async () => {
    mockGetResult.mockResolvedValue({
      status: "completed",
      businessName: "Cortaditos",
      placeId,
      identity: { placeId, businessName: "Cortaditos" },
      reviews: [
        {
          review_id: "test-002",
        },
      ],
    });

    await expect(getExtractedReviews("test-request-1", placeId)).rejects.toMatchObject({
      code: "INSUFFICIENT_REVIEWS",
    });
  });

  it("propagates provider errors", async () => {
    mockGetResult.mockRejectedValue(new Error("Provider failure"));

    await expect(getExtractedReviews("test-request-1", placeId)).rejects.toThrow(
      "Provider failure",
    );
  });

  it("rejects empty review text", async () => {
    mockGetResult.mockResolvedValue({
      status: "completed",
      businessName: "Cortaditos",
      placeId,
      identity: { placeId, businessName: "Cortaditos" },
      reviews: [
        {
          review_text: "   ",
          review_rating: 5,
        },
      ],
    });

    await expect(getExtractedReviews("test-request-1", placeId)).rejects.toMatchObject({
      code: "INSUFFICIENT_REVIEWS",
    });
  });

  it("rejects invalid review ratings", async () => {
    mockGetResult.mockResolvedValue({
      status: "completed",
      businessName: "Cortaditos",
      placeId,
      identity: { placeId, businessName: "Cortaditos" },
      reviews: [
        {
          review_text: "Great coffee!",
          review_rating: 6,
        },
      ],
    });

    await expect(getExtractedReviews("test-request-1", placeId)).rejects.toMatchObject({
      code: "INSUFFICIENT_REVIEWS",
    });
  });

  it("rejects reviews when every rating uses invalid numeric syntax", async () => {
    mockGetResult.mockResolvedValue({
      status: "completed",
      businessName: "Cortaditos",
      placeId,
      identity: { placeId, businessName: "Cortaditos" },
      reviews: [
        { review_text: "Hex rating", review_rating: "0x5" },
        { review_text: "Exponent rating", review_rating: "5e0" },
      ],
    });

    await expect(getExtractedReviews("test-request-1", placeId)).rejects.toMatchObject({
      code: "INSUFFICIENT_REVIEWS",
    });
  });

  it("keeps a mixed response usable when at least one rating is valid", async () => {
    mockGetResult.mockResolvedValue({
      status: "completed",
      businessName: "Cortaditos",
      placeId,
      identity: { placeId, businessName: "Cortaditos" },
      reviews: [
        { review_text: "Valid rating", review_rating: "4.5" },
        { review_text: "Invalid hexadecimal", review_rating: "0x5" },
        { review_text: "Invalid exponent", review_rating: "5e0" },
      ],
    });

    const result = await getExtractedReviews("test-request-1", placeId);

    expect(result.status).toBe("completed");
    if (result.status === "completed") {
      expect(result.reviews).toEqual([
        expect.objectContaining({ text: "Valid rating", rating: "4.5" }),
      ]);
    }
  });
});
