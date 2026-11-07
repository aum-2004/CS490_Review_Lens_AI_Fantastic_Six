/** @jest-environment node */
import { beginIngestion, reconcileIngestion } from "@/services/ingestion/ingestion-lifecycle";
import { getOwnedTargetOrThrow } from "@/services/analysis-targets/target-ownership";
import {
  getLatestAttempt,
  getBoundAttempt,
  type IngestionAttemptRow,
} from "@/services/ingestion/ingestion-attempt-repository";
import { OutscraperError } from "@/services/ingestion/outscraper-client";

jest.mock("@/services/analysis-targets/target-ownership", () => ({
  getOwnedTargetOrThrow: jest.fn(),
}));
jest.mock("@/services/ingestion/ingestion-attempt-repository", () => ({
  ...jest.requireActual("@/services/ingestion/ingestion-attempt-repository"),
  getLatestAttempt: jest.fn(),
  getBoundAttempt: jest.fn(),
}));
const attempt: IngestionAttemptRow = {
  id: "attempt-a",
  owner_id: "user-a",
  analysis_target_id: "target-a",
  source_url: "https://www.google.com/maps/place/Synthetic",
  submitted_query: "ChIJSynthetic",
  query_kind: "place_id",
  expected_place_id: "ChIJSynthetic",
  provider_request_id: "server-job",
  status: "processing",
  started_at: "2026-11-06T12:00:00Z",
  finished_at: null,
  saved_count: 0,
  skipped_count: 0,
  error_code: null,
  identity_basis: null,
  verified_identity: null,
};
const completed = {
  status: "completed" as const,
  placeId: "ChIJSynthetic",
  businessName: "Synthetic",
  identity: { placeId: "ChIJSynthetic", businessName: "Synthetic" },
  reviews: [{ text: "Synthetic review", rating: 4 }],
};
function dependencies() {
  return {
    writer: {
      reserve: jest.fn().mockResolvedValue({ attempt, created: true }),
      bind: jest.fn().mockResolvedValue(attempt),
      expireUnbound: jest
        .fn()
        .mockResolvedValue({ ...attempt, status: "failed", error_code: "SUBMISSION_UNCERTAIN" }),
      findForRecovery: jest.fn(),
      finish: jest
        .fn()
        .mockImplementation(async (_id, _owner, rows, skipped, _identity, error) => ({
          ...attempt,
          status: error ? "failed" : "succeeded",
          identity_basis: error
            ? null
            : attempt.query_kind === "source_url"
              ? "provider_resolved"
              : "expected_place_id",
          verified_identity: _identity,
          saved_count: rows.length,
          skipped_count: skipped,
          error_code: error,
        })),
    },
    start: jest.fn().mockResolvedValue({
      status: "accepted",
      requestId: "server-job",
      targetId: "target-a",
      providerStatus: "Pending",
    }),
    extract: jest.fn().mockResolvedValue(completed),
    storageApproved: true,
    recoveryUrl: jest.fn().mockReturnValue("https://app.example.com/synthetic-callback"),
    retryDelay: jest.fn().mockResolvedValue(undefined),
  };
}
beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, "info").mockImplementation(() => {});
  jest.mocked(getOwnedTargetOrThrow).mockResolvedValue({
    id: "target-a",
    ownerId: "user-a",
    name: "Synthetic",
    platform: "google_maps",
    sourceUrl: attempt.source_url,
    googlePlaceId: "ChIJSynthetic",
    createdAt: "2026-11-01",
  });
  jest.mocked(getLatestAttempt).mockResolvedValue(attempt);
  jest.mocked(getBoundAttempt).mockResolvedValue(attempt);
});
afterEach(() => jest.restoreAllMocks());

it("reserves before paying and binds before returning, with no job ID in the browser summary", async () => {
  const deps = dependencies();
  const result = await beginIngestion({} as never, "user-a", "target-a", deps);
  expect(deps.writer.reserve.mock.invocationCallOrder[0]).toBeLessThan(
    deps.start.mock.invocationCallOrder[0],
  );
  expect(deps.writer.bind).toHaveBeenCalledWith("attempt-a", "user-a", "server-job");
  expect(result.state).toBe("processing");
  expect(JSON.stringify(result)).not.toContain("server-job");
});
it("does not pay twice when an attempt is already active", async () => {
  const deps = dependencies();
  deps.writer.reserve.mockResolvedValue({ attempt, created: false });
  await beginIngestion({} as never, "user-a", "target-a", deps);
  expect(deps.start).not.toHaveBeenCalled();
});
it("does no provider or mutation work before authorization", async () => {
  const deps = dependencies();
  jest.mocked(getOwnedTargetOrThrow).mockRejectedValue(new Error("denied"));
  await expect(beginIngestion({} as never, "user-b", "target-a", deps)).rejects.toThrow("denied");
  expect(deps.writer.reserve).not.toHaveBeenCalled();
  expect(deps.start).not.toHaveBeenCalled();
});
it("keeps an accepted but unbound job reserved if binding fails", async () => {
  const deps = dependencies();
  deps.writer.bind.mockRejectedValue(new Error("storage unavailable"));
  await expect(beginIngestion({} as never, "user-a", "target-a", deps)).rejects.toMatchObject({
    code: "JOB_BINDING_PENDING",
  });
  expect(deps.writer.bind).toHaveBeenCalledTimes(3);
  expect(deps.start).toHaveBeenCalledTimes(1);
  expect(deps.writer.finish).not.toHaveBeenCalled();
});
it("retries only binding after a transient storage failure", async () => {
  const deps = dependencies();
  deps.writer.bind.mockRejectedValueOnce(new Error("temporary storage outage"));
  expect((await beginIngestion({} as never, "user-a", "target-a", deps)).state).toBe("processing");
  expect(deps.start).toHaveBeenCalledTimes(1);
  expect(deps.writer.bind).toHaveBeenCalledTimes(2);
  expect(deps.start).toHaveBeenCalledWith(
    expect.objectContaining({ id: "target-a" }),
    "https://app.example.com/synthetic-callback",
  );
});
it("does not start a paid job without recorded storage approval", async () => {
  const deps = dependencies();
  deps.storageApproved = false;
  await expect(beginIngestion({} as never, "user-a", "target-a", deps)).rejects.toMatchObject({
    code: "STORAGE_NOT_APPROVED",
  });
  expect(deps.start).not.toHaveBeenCalled();
  expect(deps.writer.reserve).not.toHaveBeenCalled();
});
it("retrieves by stored owner, target and job and atomically finishes verified reviews", async () => {
  const deps = dependencies();
  expect((await reconcileIngestion({} as never, "user-a", "target-a", deps)).state).toBe(
    "succeeded",
  );
  expect(getBoundAttempt).toHaveBeenCalledWith({}, "user-a", "target-a", "server-job");
  expect(deps.extract).toHaveBeenCalledWith("server-job", {
    sourceUrl: attempt.source_url,
    googlePlaceId: "ChIJSynthetic",
  });
  expect(deps.writer.finish).toHaveBeenCalledWith(
    "attempt-a",
    "user-a",
    [expect.objectContaining({ text: "Synthetic review", rating: 4 })],
    0,
    completed.identity,
    null,
  );
});
it("pending results save nothing", async () => {
  const deps = dependencies();
  deps.extract.mockResolvedValue({ status: "pending" } as never);
  expect((await reconcileIngestion({} as never, "user-a", "target-a", deps)).state).toBe(
    "processing",
  );
  expect(deps.writer.finish).not.toHaveBeenCalled();
});
it.each(["PROVIDER_TIMEOUT", "PROVIDER_QUOTA", "PROVIDER_UNAVAILABLE"])(
  "keeps an accepted job processing when result lookup returns %s",
  async (code) => {
    const deps = dependencies();
    deps.extract.mockRejectedValue(new OutscraperError(code, "private provider key"));
    await expect(reconcileIngestion({} as never, "user-a", "target-a", deps)).rejects.toMatchObject(
      { code },
    );
    expect(deps.writer.finish).not.toHaveBeenCalled();
  },
);
it("records a definitive provider failure with no reviews", async () => {
  const deps = dependencies();
  deps.extract.mockRejectedValue(new OutscraperError("PROVIDER_FAILED", "private provider detail"));
  expect((await reconcileIngestion({} as never, "user-a", "target-a", deps)).state).toBe("failed");
  expect(deps.writer.finish).toHaveBeenCalledWith(
    "attempt-a",
    "user-a",
    [],
    0,
    null,
    "INGESTION_FAILED",
  );
});
it("blocks uncertainty after a submission timeout instead of claiming it was rejected", async () => {
  const deps = dependencies();
  deps.start.mockRejectedValue(new OutscraperError("PROVIDER_TIMEOUT", "private response"));
  const result = await beginIngestion({} as never, "user-a", "target-a", deps);
  expect(result).toMatchObject({ state: "failed", errorCode: "SUBMISSION_UNCERTAIN" });
});
it("turns a stale unbound reservation into a blocked uncertain result", async () => {
  const deps = dependencies();
  jest.mocked(getLatestAttempt).mockResolvedValue({
    ...attempt,
    started_at: "2020-01-01T00:00:00Z",
    provider_request_id: null,
  });
  expect((await reconcileIngestion({} as never, "user-a", "target-a", deps)).errorCode).toBe(
    "SUBMISSION_UNCERTAIN",
  );
  expect(deps.extract).not.toHaveBeenCalled();
  expect(deps.writer.expireUnbound).toHaveBeenCalledWith("attempt-a", "user-a");
  expect(deps.writer.finish).not.toHaveBeenCalled();
});
it("preserves a job that bound after the stale application read", async () => {
  const deps = dependencies();
  jest.mocked(getLatestAttempt).mockResolvedValue({
    ...attempt,
    started_at: "2020-01-01T00:00:00Z",
    provider_request_id: null,
  });
  deps.writer.expireUnbound.mockResolvedValue(attempt as never);
  expect((await reconcileIngestion({} as never, "user-a", "target-a", deps)).state).toBe(
    "processing",
  );
  expect(deps.writer.finish).not.toHaveBeenCalled();
});
it("does not retrieve or save real provider reviews when storage approval is absent", async () => {
  const deps = dependencies();
  deps.storageApproved = false;
  await expect(reconcileIngestion({} as never, "user-a", "target-a", deps)).rejects.toMatchObject({
    code: "STORAGE_NOT_APPROVED",
  });
  expect(deps.extract).not.toHaveBeenCalled();
  expect(deps.writer.finish).not.toHaveBeenCalled();
  deps.storageApproved = true;
  expect((await reconcileIngestion({} as never, "user-a", "target-a", deps)).state).toBe(
    "succeeded",
  );
  expect(deps.start).not.toHaveBeenCalled();
});
it("saves verified URL-job results with provider-resolved provenance, not an independent source match", async () => {
  const deps = dependencies();
  jest
    .mocked(getBoundAttempt)
    .mockResolvedValue({ ...attempt, query_kind: "source_url", expected_place_id: null });
  deps.writer.finish.mockResolvedValueOnce({
    ...attempt,
    status: "succeeded",
    saved_count: 1,
    identity_basis: "provider_resolved",
    verified_identity: completed.identity,
  } as never);
  const result = await reconcileIngestion({} as never, "user-a", "target-a", deps);
  expect(result.state).toBe("succeeded");
  expect(result.identityBasis).toBe("provider_resolved");
  expect(result.providerBusinessName).toBe("Synthetic");
  expect(deps.writer.finish).toHaveBeenCalledWith(
    "attempt-a",
    "user-a",
    expect.arrayContaining([expect.objectContaining({ text: "Synthetic review" })]),
    0,
    completed.identity,
    null,
  );
  expect(jest.mocked(getOwnedTargetOrThrow).mock.results).toHaveLength(1);
});
it("rejects results that disagree with the stored expected Place ID", async () => {
  const deps = dependencies();
  deps.extract.mockResolvedValue({
    ...completed,
    placeId: "ChIJOther",
    identity: { placeId: "ChIJOther", businessName: "Other" },
  });
  expect((await reconcileIngestion({} as never, "user-a", "target-a", deps)).state).toBe("failed");
  expect(deps.writer.finish).toHaveBeenCalledWith(
    "attempt-a",
    "user-a",
    [],
    0,
    expect.any(Object),
    "SOURCE_IDENTITY_UNVERIFIED",
  );
});
it("does not repeat extraction after a terminal state", async () => {
  const deps = dependencies();
  jest
    .mocked(getLatestAttempt)
    .mockResolvedValue({ ...attempt, status: "succeeded", saved_count: 1 });
  await reconcileIngestion({} as never, "user-a", "target-a", deps);
  expect(deps.extract).not.toHaveBeenCalled();
  expect(deps.writer.finish).not.toHaveBeenCalled();
});
it("rolls storage failures up instead of claiming success", async () => {
  const deps = dependencies();
  deps.writer.finish.mockRejectedValue(new Error("database unavailable"));
  await expect(reconcileIngestion({} as never, "user-a", "target-a", deps)).rejects.toThrow(
    "database unavailable",
  );
});
