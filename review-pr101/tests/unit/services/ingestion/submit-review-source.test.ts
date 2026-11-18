import {
  submitReviewSource,
  type IngestionTarget,
} from "@/services/ingestion/submit-review-source";

const USER_ID = "user-a";
const TARGET_ID = "target-a";
const PLACE_ID = "ChIJi9xEDhlZwokRZXXlcZ6Ubkw";

function makeTarget(overrides: Partial<IngestionTarget> = {}): IngestionTarget {
  return {
    id: TARGET_ID,
    ownerId: USER_ID,
    platform: "google_maps",
    sourceUrl: "https://www.google.com/maps/place/Cortaditos",
    googlePlaceId: PLACE_ID,
    ...overrides,
  };
}

describe("submitReviewSource", () => {
  it("rejects an unauthenticated submission before target lookup", async () => {
    const getTargetById = jest.fn();
    const startExtraction = jest.fn();

    await expect(
      submitReviewSource("  ", TARGET_ID, { getTargetById, startExtraction }),
    ).rejects.toMatchObject({ code: "AUTH_REQUIRED" });
    expect(getTargetById).not.toHaveBeenCalled();
    expect(startExtraction).not.toHaveBeenCalled();
  });

  it("rejects a missing target before starting provider extraction", async () => {
    const getTargetById = jest.fn().mockResolvedValue(null);
    const startExtraction = jest.fn();

    await expect(
      submitReviewSource(USER_ID, TARGET_ID, { getTargetById, startExtraction }),
    ).rejects.toMatchObject({ code: "TARGET_NOT_FOUND" });
    expect(getTargetById).toHaveBeenCalledWith(USER_ID, TARGET_ID);
    expect(startExtraction).not.toHaveBeenCalled();
  });

  it("rejects another user's target before provider access", async () => {
    const getTargetById = jest.fn().mockResolvedValue(makeTarget({ ownerId: "user-b" }));
    const startExtraction = jest.fn();

    await expect(
      submitReviewSource(USER_ID, TARGET_ID, { getTargetById, startExtraction }),
    ).rejects.toMatchObject({ code: "TARGET_NOT_FOUND" });
    expect(startExtraction).not.toHaveBeenCalled();
  });

  it("rejects invalid or unresolved source information", async () => {
    const getTargetById = jest
      .fn()
      .mockResolvedValue(makeTarget({ sourceUrl: "not-a-google-maps-url" }));
    const startExtraction = jest.fn();

    await expect(
      submitReviewSource(USER_ID, TARGET_ID, { getTargetById, startExtraction }),
    ).rejects.toMatchObject({ code: "SOURCE_NOT_CONFIGURED" });
    expect(startExtraction).not.toHaveBeenCalled();
  });

  it("starts extraction for an owned, configured target", async () => {
    const getTargetById = jest.fn().mockResolvedValue(makeTarget());
    const startExtraction = jest.fn().mockResolvedValue({ id: "request-123", status: "Pending" });

    await expect(
      submitReviewSource(USER_ID, TARGET_ID, { getTargetById, startExtraction }),
    ).resolves.toEqual({
      status: "accepted",
      targetId: TARGET_ID,
      requestId: "request-123",
      providerStatus: "Pending",
    });
    expect(startExtraction).toHaveBeenCalledWith({ kind: "place_id", value: PLACE_ID });
  });

  it("uses the stored validated URL when no Place ID is available", async () => {
    const getTargetById = jest.fn().mockResolvedValue(makeTarget({ googlePlaceId: null }));
    const startExtraction = jest.fn().mockResolvedValue({ id: "request-url", status: "Pending" });

    await expect(
      submitReviewSource(USER_ID, TARGET_ID, { getTargetById, startExtraction }),
    ).resolves.toMatchObject({ status: "accepted", requestId: "request-url" });
    expect(startExtraction).toHaveBeenCalledWith({
      kind: "source_url",
      value: "https://www.google.com/maps/place/Cortaditos",
    });
  });

  it("propagates provider failures without returning success", async () => {
    const providerError = new Error("provider unavailable");
    const getTargetById = jest.fn().mockResolvedValue(makeTarget());
    const startExtraction = jest.fn().mockRejectedValue(providerError);

    await expect(
      submitReviewSource(USER_ID, TARGET_ID, { getTargetById, startExtraction }),
    ).rejects.toBe(providerError);
  });
});
