import { OutscraperError, startOutscraperExtraction } from "@/services/ingestion/outscraper-client";

describe("Outscraper API client", () => {
  const placeId = "ChIJi9xEDhlZwokRZXXlcZ6Ubkw";
  const originalApiKey = process.env.OUTSCRAPER_API_KEY;

  beforeEach(() => {
    process.env.OUTSCRAPER_API_KEY = "test-api-key";
  });

  afterEach(() => {
    if (originalApiKey === undefined) {
      delete process.env.OUTSCRAPER_API_KEY;
    } else {
      process.env.OUTSCRAPER_API_KEY = originalApiKey;
    }
  });

  // Create a fake HTTP response without using the
  // browser Response object.
  function mockResponse(status: number, body: unknown = {}) {
    return {
      ok: status >= 200 && status < 300,
      status,
      json: jest.fn().mockResolvedValue(body),
    };
  }

  it("starts an extraction job", async () => {
    const mockFetch = jest.fn().mockResolvedValue(
      mockResponse(200, {
        id: "test-job-001",
        status: "Pending",
      }),
    );

    const result = await startOutscraperExtraction(placeId, mockFetch as unknown as typeof fetch);

    expect(result).toEqual({
      id: "test-job-001",
      status: "Pending",
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);

    const [url, options] = mockFetch.mock.calls[0];

    expect(url.searchParams.get("query")).toBe(placeId);
    expect(url.searchParams.get("reviewsLimit")).toBe("30");
    expect(options.headers["X-API-KEY"]).toBe("test-api-key");
  });

  it("rejects an invalid place ID", async () => {
    await expect(startOutscraperExtraction("invalid-id")).rejects.toMatchObject({
      code: "INVALID_PLACE_ID",
    });
  });

  it("rejects missing API configuration", async () => {
    delete process.env.OUTSCRAPER_API_KEY;

    await expect(startOutscraperExtraction(placeId)).rejects.toMatchObject({
      code: "MISSING_API_KEY",
    });
  });

  it.each([
    [401, "PROVIDER_AUTH"],
    [402, "PROVIDER_BILLING"],
    [403, "PROVIDER_AUTH"],
    [429, "PROVIDER_QUOTA"],
    [500, "PROVIDER_FAILED"],
  ])("handles HTTP %i", async (status, code) => {
    const mockFetch = jest.fn().mockResolvedValue(mockResponse(status));

    await expect(
      startOutscraperExtraction(placeId, mockFetch as unknown as typeof fetch),
    ).rejects.toMatchObject({ code });
  });

  it("handles network failures", async () => {
    const mockFetch = jest.fn().mockRejectedValue(new Error("Network error"));

    await expect(
      startOutscraperExtraction(placeId, mockFetch as unknown as typeof fetch),
    ).rejects.toMatchObject({
      code: "PROVIDER_UNAVAILABLE",
    });
  });

  it("rejects an invalid provider response", async () => {
    const mockFetch = jest.fn().mockResolvedValue(
      mockResponse(200, {
        message: "Invalid job",
      }),
    );

    await expect(
      startOutscraperExtraction(placeId, mockFetch as unknown as typeof fetch),
    ).rejects.toBeInstanceOf(OutscraperError);
  });
});
