/** @jest-environment node */
import { listTargetsWithIngestion } from "@/services/analysis-targets/list-targets-with-ingestion";
import { listAnalysisTargets } from "@/services/analysis-targets/list-analysis-targets";
import { getTargetIngestionSummaries } from "@/services/ingestion/ingestion-attempt-repository";
import { NO_INGESTION } from "@/services/ingestion/ingestion-state";
jest.mock("@/services/analysis-targets/list-analysis-targets", () => ({
  listAnalysisTargets: jest.fn(),
}));
jest.mock("@/services/ingestion/ingestion-attempt-repository", () => ({
  getTargetIngestionSummaries: jest.fn(),
}));
beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, "error").mockImplementation(() => {});
  jest.mocked(listAnalysisTargets).mockResolvedValue([
    {
      id: "a",
      name: "A",
      platform: "google_maps",
      sourceUrl: "https://www.google.com/maps/place/A",
      createdAt: "2026-11-01",
    },
  ]);
});
afterEach(() => jest.restoreAllMocks());
it("attaches confirmed no-attempt state using only the authenticated owner's listed target IDs", async () => {
  jest.mocked(getTargetIngestionSummaries).mockResolvedValue(new Map([["a", NO_INGESTION]]));
  const result = await listTargetsWithIngestion({} as never, "user-a");
  expect(getTargetIngestionSummaries).toHaveBeenCalledWith({}, "user-a", ["a"]);
  expect(result[0].ingestion?.state).toBe("not_ingested");
});
it("preserves an unavailable result instead of inventing no ingestion", async () => {
  jest.mocked(getTargetIngestionSummaries).mockRejectedValue(new Error("private SQL"));
  const result = await listTargetsWithIngestion({} as never, "user-a");
  expect(result[0].ingestion).toBeNull();
  expect(JSON.stringify(result)).not.toContain("not_ingested");
});
