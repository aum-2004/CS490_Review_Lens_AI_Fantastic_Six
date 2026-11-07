/** @jest-environment node */
import { beginIngestion, reconcileIngestion } from "@/services/ingestion/ingestion-lifecycle";
import { getOwnedTargetOrThrow } from "@/services/analysis-targets/target-ownership";
import {
  getLatestAttempt,
  getBoundAttempt,
  type IngestionAttemptRow,
} from "@/services/ingestion/ingestion-attempt-repository";
import { OutscraperError, startOutscraperExtraction } from "@/services/ingestion/outscraper-client";
import { getExtractedReviews } from "@/services/ingestion/outscraper-service";
import { ingestionErrorMessage } from "@/services/ingestion/ingestion-state";
import { IngestionLimitError } from "@/services/ingestion/ingestion-limits";

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
      expireBound: jest
        .fn()
        .mockImplementation(
          async () => await getBoundAttempt({} as never, "user-a", "target-a", "server-job"),
        ),
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
it("does not call the paid provider after the owner budget is exhausted", async () => {
  const deps = dependencies();
  deps.writer.reserve.mockRejectedValue(new IngestionLimitError("INGESTION_START_LIMIT"));
  await expect(beginIngestion({} as never, "user-a", "target-a", deps)).rejects.toMatchObject({
    code: "INGESTION_START_LIMIT",
  });
  expect(deps.start).not.toHaveBeenCalled();
  expect(deps.writer.bind).not.toHaveBeenCalled();
});
it("preserves an accepted job when result size limits reject a lookup", async () => {
  const deps = dependencies();
  deps.extract.mockRejectedValue(new IngestionLimitError("INGESTION_RESULT_LIMIT"));
  await expect(reconcileIngestion({} as never, "user-a", "target-a", deps)).rejects.toMatchObject({
    code: "INGESTION_RESULT_LIMIT",
  });
  expect(deps.writer.finish).not.toHaveBeenCalled();
  deps.writer.reserve.mockResolvedValue({ attempt, created: false });
  await beginIngestion({} as never, "user-a", "target-a", deps);
  expect(deps.start).not.toHaveBeenCalled();
});
it("cleans the verified business name before sending it to persistence", async () => {
  const deps = dependencies();
  deps.extract.mockResolvedValue({
    ...completed,
    businessName: "Syn\u0000thetic",
    identity: { ...completed.identity, businessName: "Syn\u0000thetic" },
  });
  await reconcileIngestion({} as never, "user-a", "target-a", deps);
  expect(deps.writer.finish).toHaveBeenCalledWith(
    "attempt-a",
    "user-a",
    expect.any(Array),
    0,
    expect.objectContaining({ businessName: "Synthetic" }),
    null,
  );
});
it("does not start another run for a successfully ingested target", async () => {
  const deps = dependencies();
  deps.writer.reserve.mockResolvedValue({
    attempt: { ...attempt, status: "succeeded", saved_count: 1 },
    created: false,
  });
  expect((await beginIngestion({} as never, "user-a", "target-a", deps)).state).toBe("succeeded");
  expect(deps.start).not.toHaveBeenCalled();
});
it.each(["PROVIDER_AUTH", "PROVIDER_BILLING", "MISSING_API_KEY"])(
  "explains submission %s as an account/configuration issue rather than a source error",
  async (code) => {
    const deps = dependencies();
    deps.start.mockRejectedValue(
      new OutscraperError(code, "synthetic private configuration detail"),
    );
    const result = await beginIngestion({} as never, "user-a", "target-a", deps);
    expect(result).toMatchObject({
      state: "failed",
      errorCode: "PROVIDER_CONFIGURATION_UNAVAILABLE",
    });
    expect(ingestionErrorMessage(result.errorCode)).toMatch(/account or configuration/);
    expect(ingestionErrorMessage(result.errorCode)).not.toMatch(/check the source/i);
  },
);
it.each([401, 402, 403, 404, 502, "invalid-json", "missing-key"])(
  "preserves the paid job across lookup %s, prevents another start, and resumes the same job",
  async (failure) => {
    const deps = dependencies();
    let stored: IngestionAttemptRow | null = null;
    deps.writer.reserve.mockImplementation(async () => {
      const blocked =
        stored &&
        (stored.status === "processing" ||
          stored.status === "succeeded" ||
          stored.error_code === "SUBMISSION_UNCERTAIN");
      if (blocked) return { attempt: stored!, created: false };
      stored = { ...attempt };
      return { attempt: stored, created: true };
    });
    deps.writer.finish.mockImplementation(async (_id, _owner, rows, skipped, identity, error) => {
      stored = {
        ...attempt,
        status: error ? "failed" : "succeeded",
        error_code: error,
        saved_count: rows.length,
        skipped_count: skipped,
        verified_identity: identity,
      };
      return stored as never;
    });
    jest.mocked(getLatestAttempt).mockImplementation(async () => stored);
    jest.mocked(getBoundAttempt).mockImplementation(async () => stored!);
    const previousKey = process.env.OUTSCRAPER_API_KEY;
    try {
      process.env.OUTSCRAPER_API_KEY = "synthetic-test-key";
      const provider = jest.fn().mockImplementation(
        async () =>
          new Response("invalid JSON", {
            status: typeof failure === "number" ? failure : 200,
          }),
      );
      await beginIngestion({} as never, "user-a", "target-a", deps);
      if (failure === "missing-key") delete process.env.OUTSCRAPER_API_KEY;
      deps.extract.mockImplementationOnce(
        (id, identity) => getExtractedReviews(id, identity, provider as never) as never,
      );
      await expect(
        reconcileIngestion({} as never, "user-a", "target-a", deps),
      ).rejects.toMatchObject({
        code:
          typeof failure === "number" && [404, 502].includes(failure)
            ? "PROVIDER_UNAVAILABLE"
            : "RESULT_LOOKUP_UNAVAILABLE",
      });
      expect(deps.writer.finish).not.toHaveBeenCalled();
      expect(stored).toMatchObject({ status: "processing", provider_request_id: "server-job" });
      await beginIngestion({} as never, "user-a", "target-a", deps);
      expect(deps.start).toHaveBeenCalledTimes(1);
      process.env.OUTSCRAPER_API_KEY = "synthetic-test-key";
      expect((await reconcileIngestion({} as never, "user-a", "target-a", deps)).state).toBe(
        "succeeded",
      );
      expect(deps.extract).toHaveBeenLastCalledWith("server-job", expect.any(Object));
      await beginIngestion({} as never, "user-a", "target-a", deps);
      expect(deps.start).toHaveBeenCalledTimes(1);
    } finally {
      if (previousKey === undefined) delete process.env.OUTSCRAPER_API_KEY;
      else process.env.OUTSCRAPER_API_KEY = previousKey;
    }
  },
);
it.each(["pending", "404"])(
  "expires an overdue %s job without fetching or saving more results",
  async (result) => {
    const deps = dependencies();
    deps.extract.mockImplementationOnce(async () => {
      if (result === "404") throw new OutscraperError("PROVIDER_UNAVAILABLE", "synthetic 404");
      return { status: "pending" } as never;
    });
    if (result === "404")
      await expect(reconcileIngestion({} as never, "user-a", "target-a", deps)).rejects.toThrow();
    else
      expect((await reconcileIngestion({} as never, "user-a", "target-a", deps)).state).toBe(
        "processing",
      );
    const expired = { ...attempt, status: "failed" as const, error_code: "RESULT_WINDOW_EXPIRED" };
    deps.writer.expireBound.mockResolvedValue(expired);
    deps.writer.reserve.mockResolvedValue({ attempt: expired, created: false });
    expect((await reconcileIngestion({} as never, "user-a", "target-a", deps)).errorCode).toBe(
      "RESULT_WINDOW_EXPIRED",
    );
    await beginIngestion({} as never, "user-a", "target-a", deps);
    expect(deps.start).not.toHaveBeenCalled();
    expect(deps.extract).toHaveBeenCalledTimes(1);
    expect(deps.writer.finish).not.toHaveBeenCalled();
  },
);
it.each([400, 404, 422, 408, 500, "invalid-json"])(
  "distinguishes submission rejection %s from uncertain acceptance",
  async (status) => {
    const deps = dependencies();
    const previousKey = process.env.OUTSCRAPER_API_KEY;
    process.env.OUTSCRAPER_API_KEY = "synthetic-test-key";
    try {
      const provider = jest.fn().mockResolvedValue({
        ok: status === "invalid-json",
        status: typeof status === "number" ? status : 200,
        json: async () => {
          throw new SyntaxError("invalid");
        },
      });
      deps.start.mockImplementationOnce(async () => {
        await startOutscraperExtraction("ChIJSynthetic", provider as never);
        throw new Error("Unexpected acceptance");
      });
      const result = await beginIngestion({} as never, "user-a", "target-a", deps);
      expect(result.errorCode).toBe(
        typeof status === "number" && status < 500 && status !== 408
          ? "PROVIDER_REJECTED"
          : "SUBMISSION_UNCERTAIN",
      );
      expect(provider).toHaveBeenCalledTimes(1);
    } finally {
      if (previousKey === undefined) delete process.env.OUTSCRAPER_API_KEY;
      else process.env.OUTSCRAPER_API_KEY = previousKey;
    }
  },
);
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
