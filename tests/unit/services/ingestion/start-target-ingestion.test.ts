/** @jest-environment node */
import type { AnalysisTarget } from "@/services/analysis-targets/analysis-target-repository";
import {
  IngestionSourceNotConfiguredError,
  startTargetIngestion,
} from "@/services/ingestion/start-target-ingestion";

const target: AnalysisTarget = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  ownerId: "11111111-1111-4111-8111-111111111111",
  name: "Target A",
  platform: "google_maps",
  sourceUrl: "https://www.google.com/maps/place/Example",
  googlePlaceId: "ChIJAAAAAAAAAAAAAAAAAAAAAAA",
  createdAt: "2026-11-01T00:00:00Z",
};

describe("startTargetIngestion", () => {
  it("starts the provider job for the target's place id", async () => {
    const startExtraction = jest.fn().mockResolvedValue({ id: "job-1", status: "Pending" });

    await expect(startTargetIngestion(target, startExtraction)).resolves.toEqual({
      status: "accepted",
      targetId: target.id,
      requestId: "job-1",
      providerStatus: "Pending",
    });
    expect(startExtraction).toHaveBeenCalledWith(target.googlePlaceId);
  });

  it.each([null, "", "   "])(
    "refuses a target whose place id is %p without calling the provider",
    async (googlePlaceId) => {
      const startExtraction = jest.fn();

      await expect(
        startTargetIngestion({ ...target, googlePlaceId }, startExtraction),
      ).rejects.toBeInstanceOf(IngestionSourceNotConfiguredError);
      expect(startExtraction).not.toHaveBeenCalled();
    },
  );
});
