import { getOutscraperResult } from "@/services/ingestion/outscraper-client";

describe("Outscraper result retrieval", () => {
  const placeId = "ChIJi9xEDhlZwokRZXXlcZ6Ubkw";
  const originalKey = process.env.OUTSCRAPER_API_KEY;

  beforeEach(() => {
    process.env.OUTSCRAPER_API_KEY = "test-key";
  });

  afterEach(() => {
    if (originalKey === undefined) {
      delete process.env.OUTSCRAPER_API_KEY;
    } else {
      process.env.OUTSCRAPER_API_KEY = originalKey;
    }
  });

  function mockFetchResponse(status: number, body: unknown = {}) {
    return jest.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      json: jest.fn().mockResolvedValue(body),
    });
  }

  it("returns pending while processing", async () => {
    const fetcher = mockFetchResponse(200, {
      id: "test-request-1",
      status: "Pending",
    });

    const result = await getOutscraperResult(
      "test-request-1",
      placeId,
      fetcher as unknown as typeof fetch,
    );

    expect(result).toEqual({ status: "pending" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("retrieves reviews for the correct business", async () => {
    const fetcher = mockFetchResponse(200, {
      status: "Success",
      data: [
        [
          {
            name: "Cortaditos",
            place_id: placeId,
            reviews_data: [
              {
                review_text: "Test review",
                review_rating: 5,
                review_id: "test-001",
              },
            ],
          },
        ],
      ],
    });

    const result = await getOutscraperResult(
      "test-request-1",
      placeId,
      fetcher as unknown as typeof fetch,
    );

    expect(result).toMatchObject({
      status: "completed",
      businessName: "Cortaditos",
      placeId,
      reviews: [
        {
          review_text: "Test review",
          review_rating: 5,
        },
      ],
    });
  });

  it.each(["", "   "])("rejects a nested business with a blank name: %j", async (name) => {
    const fetcher = mockFetchResponse(200, {
      status: "Success",
      data: [
        {
          name,
          place_id: placeId,
          reviews_data: [{ review_text: "Test review", review_rating: 5 }],
        },
      ],
    });

    await expect(
      getOutscraperResult("test-request-1", placeId, fetcher as unknown as typeof fetch),
    ).rejects.toMatchObject({ code: "IDENTITY_MISSING" });
  });

  it("rejects reviews from a different business", async () => {
    const fetcher = mockFetchResponse(200, {
      status: "Success",
      data: [
        {
          name: "Another Business",
          place_id: "ChIJDifferentPlace",
          reviews_data: [
            {
              review_text: "Test",
              review_rating: 4,
            },
          ],
        },
      ],
    });

    await expect(
      getOutscraperResult("test-request-1", placeId, fetcher as unknown as typeof fetch),
    ).rejects.toMatchObject({
      code: "BUSINESS_MISMATCH",
    });
  });

  it("rejects an empty review result", async () => {
    const fetcher = mockFetchResponse(200, {
      status: "Success",
      data: [
        {
          name: "Cortaditos",
          place_id: placeId,
          reviews_data: [],
        },
      ],
    });

    await expect(
      getOutscraperResult("test-request-1", placeId, fetcher as unknown as typeof fetch),
    ).rejects.toMatchObject({
      code: "NO_REVIEWS",
    });
  });

  it("handles a failed extraction", async () => {
    const fetcher = mockFetchResponse(200, {
      status: "Failure",
    });

    await expect(
      getOutscraperResult("test-request-1", placeId, fetcher as unknown as typeof fetch),
    ).rejects.toMatchObject({
      code: "PROVIDER_FAILED",
    });
  });

  it("handles provider quota errors", async () => {
    const fetcher = mockFetchResponse(429);

    await expect(
      getOutscraperResult("test-request-1", placeId, fetcher as unknown as typeof fetch),
    ).rejects.toMatchObject({
      code: "PROVIDER_QUOTA",
    });
  });

  it("classifies result retrieval timeouts separately", async () => {
    const fetcher = jest.fn().mockRejectedValue(new DOMException("Timed out", "TimeoutError"));

    await expect(
      getOutscraperResult("test-request-1", placeId, fetcher as unknown as typeof fetch),
    ).rejects.toMatchObject({ code: "PROVIDER_TIMEOUT" });
  });

  it("rejects an invalid request ID", async () => {
    await expect(getOutscraperResult("../invalid", placeId)).rejects.toMatchObject({
      code: "INVALID_REQUEST_ID",
    });
  });

  it("handles Outscraper's documented JSON response structure", async () => {
    const fetcher = mockFetchResponse(200, {
      id: "test-request-2",
      status: "Success",
      data: [
        {
          name: "Cortaditos",
          full_address: "4501 Park Ave, Union City, NJ 07087",
          place_id: placeId,
          google_id: "0x89c259190e44dc8b:0x4c6e949e71e57565",
          reviews_data: [
            {
              review_id: "fixture-review-001",
              author_title: "Test Reviewer",
              review_text: "Test coffee review",
              review_rating: 5,
              review_timestamp: 1792422703,
              review_link: "https://example.com/test-review",
            },
          ],
        },
      ],
    });

    const result = await getOutscraperResult(
      "test-request-2",
      placeId,
      fetcher as unknown as typeof fetch,
    );

    expect(result.status).toBe("completed");

    if (result.status === "completed") {
      expect(result.businessName).toBe("Cortaditos");
      expect(result.placeId).toBe(placeId);
      expect(result.reviews).toHaveLength(1);
      expect(result.reviews[0].review_text).toBe("Test coffee review");
      expect(result.reviews[0].review_rating).toBe(5);
    }
  });

  it("accepts nested reviews that inherit parent identity fields", async () => {
    const googleId = "0x89c259190e44dc8b:0x4c6e949e71e57565";
    const locationLink = "https://www.google.com/maps/place/Cortaditos";
    const fetcher = mockFetchResponse(200, {
      status: "Success",
      data: [
        {
          name: "Cortaditos",
          place_id: placeId,
          google_id: googleId,
          location_link: locationLink,
          reviews_data: [
            { review_id: "nested-001", review_text: "A" },
            {
              review_id: "nested-002",
              google_id: googleId,
              location_link: locationLink,
              review_text: "B",
            },
          ],
        },
      ],
    });

    await expect(
      getOutscraperResult("test-request-2", placeId, fetcher as unknown as typeof fetch),
    ).resolves.toMatchObject({
      status: "completed",
      identity: { googleId, locationLink },
      reviews: [{ review_id: "nested-001" }, { review_id: "nested-002" }],
    });
  });

  it("rejects a nested child review with a conflicting Google ID", async () => {
    const fetcher = mockFetchResponse(200, {
      status: "Success",
      data: [
        {
          name: "Cortaditos",
          place_id: placeId,
          google_id: "google-parent",
          reviews_data: [{ review_text: "A", google_id: "google-other" }],
        },
      ],
    });

    await expect(
      getOutscraperResult("test-request-2", placeId, fetcher as unknown as typeof fetch),
    ).rejects.toMatchObject({ code: "IDENTITY_AMBIGUOUS" });
  });

  it("rejects a nested child review with a conflicting location link", async () => {
    const fetcher = mockFetchResponse(200, {
      status: "Success",
      data: [
        {
          name: "Cortaditos",
          place_id: placeId,
          location_link: "https://www.google.com/maps/place/Cortaditos",
          reviews_data: [
            { review_text: "A", location_link: "https://www.google.com/maps/place/Other" },
          ],
        },
      ],
    });

    await expect(
      getOutscraperResult("test-request-2", placeId, fetcher as unknown as typeof fetch),
    ).rejects.toMatchObject({ code: "IDENTITY_AMBIGUOUS" });
  });

  it("resolves a URL query into one verified provider Place ID", async () => {
    const fetcher = mockFetchResponse(200, {
      status: "Success",
      data: [
        {
          name: "Cortaditos",
          place_id: placeId,
          google_id: "0x89c259190e44dc8b:0x4c6e949e71e57565",
          location_link: "https://www.google.com/maps/place/Cortaditos",
          review_id: "test-001",
          review_text: "Great coffee!",
          review_rating: 5,
        },
      ],
    });

    const result = await getOutscraperResult(
      "test-url-request",
      {
        sourceUrl: "https://www.google.com/maps/place/Cortaditos",
        googlePlaceId: null,
      },
      fetcher as unknown as typeof fetch,
    );

    expect(result).toMatchObject({
      status: "completed",
      placeId,
      identity: {
        placeId,
        googleId: "0x89c259190e44dc8b:0x4c6e949e71e57565",
      },
    });
  });

  it("rejects a URL result with no provider identity", async () => {
    const fetcher = mockFetchResponse(200, {
      status: "Success",
      data: [{ name: "Cortaditos", review_text: "Great coffee!", review_rating: 5 }],
    });

    await expect(
      getOutscraperResult(
        "test-url-request",
        {
          sourceUrl: "https://www.google.com/maps/place/Cortaditos",
          googlePlaceId: null,
        },
        fetcher as unknown as typeof fetch,
      ),
    ).rejects.toMatchObject({ code: "IDENTITY_MISSING" });
  });

  it("rejects ambiguous URL results containing multiple Place IDs", async () => {
    const fetcher = mockFetchResponse(200, {
      status: "Success",
      data: [
        { name: "Cortaditos", place_id: placeId, review_text: "A", review_rating: 5 },
        { name: "Cortaditos", place_id: "ChIJDifferentPlace", review_text: "B", review_rating: 4 },
      ],
    });

    await expect(
      getOutscraperResult(
        "test-url-request",
        {
          sourceUrl: "https://www.google.com/maps/place/Cortaditos",
          googlePlaceId: null,
        },
        fetcher as unknown as typeof fetch,
      ),
    ).rejects.toMatchObject({ code: "IDENTITY_AMBIGUOUS" });
  });

  it("rejects a flat response with an invalid Place ID format", async () => {
    const fetcher = mockFetchResponse(200, {
      status: "Success",
      data: [{ name: "Cortaditos", place_id: "not-a-place-id", review_text: "A" }],
    });

    await expect(
      getOutscraperResult(
        "test-url-request",
        {
          sourceUrl: "https://www.google.com/maps/place/Cortaditos",
          googlePlaceId: null,
        },
        fetcher as unknown as typeof fetch,
      ),
    ).rejects.toMatchObject({ code: "IDENTITY_MISSING" });
  });

  it("rejects inconsistent google IDs in flat responses", async () => {
    const fetcher = mockFetchResponse(200, {
      status: "Success",
      data: [
        { name: "Cortaditos", place_id: placeId, google_id: "google-a", review_text: "A" },
        { name: "Cortaditos", place_id: placeId, google_id: "google-b", review_text: "B" },
      ],
    });

    await expect(
      getOutscraperResult("test-request-1", placeId, fetcher as unknown as typeof fetch),
    ).rejects.toMatchObject({ code: "IDENTITY_AMBIGUOUS" });
  });

  it("rejects inconsistent location links in flat responses", async () => {
    const fetcher = mockFetchResponse(200, {
      status: "Success",
      data: [
        {
          name: "Cortaditos",
          place_id: placeId,
          location_link: "https://maps.example/a",
          review_text: "A",
        },
        {
          name: "Cortaditos",
          place_id: placeId,
          location_link: "https://maps.example/b",
          review_text: "B",
        },
      ],
    });

    await expect(
      getOutscraperResult("test-request-1", placeId, fetcher as unknown as typeof fetch),
    ).rejects.toMatchObject({ code: "IDENTITY_AMBIGUOUS" });
  });

  it("rejects nested results containing more than one business", async () => {
    const fetcher = mockFetchResponse(200, {
      status: "Success",
      data: [
        { name: "Cortaditos", place_id: placeId, reviews_data: [{ review_text: "A" }] },
        { name: "Other", place_id: placeId, reviews_data: [{ review_text: "B" }] },
      ],
    });

    await expect(
      getOutscraperResult("test-request-1", placeId, fetcher as unknown as typeof fetch),
    ).rejects.toMatchObject({ code: "IDENTITY_AMBIGUOUS" });
  });

  it("handles the real flat Outscraper review response", async () => {
    const fetcher = mockFetchResponse(200, {
      status: "Success",
      data: [
        {
          name: "Cortaditos",
          place_id: placeId,
          review_id: "test-001",
          review_text: "Great coffee!",
          review_rating: 5,
        },
        {
          name: "Cortaditos",
          place_id: placeId,
          review_id: "test-002",
          review_text: "Friendly staff!",
          review_rating: 4,
        },
      ],
    });

    const result = await getOutscraperResult(
      "test-request-1",
      placeId,
      fetcher as unknown as typeof fetch,
    );

    expect(result.status).toBe("completed");

    if (result.status === "completed") {
      expect(result.businessName).toBe("Cortaditos");
      expect(result.placeId).toBe(placeId);
      expect(result.reviews).toHaveLength(2);
      expect(result.reviews[0].review_text).toBe("Great coffee!");
      expect(result.reviews[1].review_rating).toBe(4);
    }
  });

  it("rejects flat reviews from another business", async () => {
    const fetcher = mockFetchResponse(200, {
      status: "Success",
      data: [
        {
          name: "Cortaditos",
          place_id: placeId,
          review_text: "Great coffee!",
          review_rating: 5,
        },
        {
          name: "Another Business",
          place_id: "ChIJDifferentPlace",
          review_text: "Test review",
          review_rating: 4,
        },
      ],
    });

    await expect(
      getOutscraperResult("test-request-1", placeId, fetcher as unknown as typeof fetch),
    ).rejects.toMatchObject({
      code: "BUSINESS_MISMATCH",
    });
  });
});
