/** @jest-environment node */
import {
  beginIngestionReingest,
  createReingestReserver,
  getLastSuccessfulAttempt,
  IngestionReingestError,
  loadReingestBaseline,
} from "@/services/ingestion/ingestion-reingest";
import { IngestionPersistenceError } from "@/services/ingestion/ingestion-attempt-repository";
import { IngestionLimitError } from "@/services/ingestion/ingestion-limits";
import { getOwnedTargetOrThrow } from "@/services/analysis-targets/target-ownership";
import { NO_INGESTION, type IngestionSummary } from "@/services/ingestion/ingestion-state";

jest.mock("@/lib/supabase/ingestion-admin", () => ({
  createIngestionAdminClient: () => {
    throw new Error("tests must never build a service-role client");
  },
}));
jest.mock("@/services/analysis-targets/target-ownership", () => ({
  ...jest.requireActual("@/services/analysis-targets/target-ownership"),
  getOwnedTargetOrThrow: jest.fn(),
}));

const OWNER = "11111111-1111-4111-8111-111111111111";
const TARGET = "33333333-3333-4333-8333-333333333333";
const attempt = {
  id: "44444444-4444-4444-8444-444444444444",
  analysis_target_id: TARGET,
  owner_id: OWNER,
  source_url: "https://www.google.com/maps/place/Synthetic",
  submitted_query: "ChIJSynthetic",
  query_kind: "place_id" as const,
  expected_place_id: "ChIJSynthetic",
  provider_request_id: null,
  status: "processing" as const,
  started_at: "2026-11-27T12:00:00Z",
  finished_at: null,
  saved_count: 0,
  skipped_count: 0,
  error_code: null,
  identity_basis: null,
  verified_identity: null,
};

function rpcClient(result: { data?: unknown; error?: unknown }) {
  const rpc = jest.fn().mockResolvedValue({ data: null, error: null, ...result });
  return { client: { rpc } as never, rpc };
}

describe("createReingestReserver", () => {
  it("calls only the refresh RPC with the server-supplied owner and target", async () => {
    const { client, rpc } = rpcClient({ data: { attempt, created: true } });
    await expect(createReingestReserver(client)(TARGET, OWNER)).resolves.toEqual({
      attempt,
      created: true,
    });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("reserve_reingestion_attempt", {
      p_target_id: TARGET,
      p_owner_id: OWNER,
    });
  });

  it.each(["REINGEST_IN_PROGRESS", "REINGEST_BLOCKED", "REINGEST_UNAVAILABLE"])(
    "maps %s to a typed refresh error",
    async (message) => {
      const { client } = rpcClient({ error: { code: "P0001", message } });
      const error = await createReingestReserver(client)(TARGET, OWNER).catch((e) => e);
      expect(error).toBeInstanceOf(IngestionReingestError);
      expect(error.code).toBe(message);
    },
  );

  it("maps the shared paid-start limit", async () => {
    const { client } = rpcClient({ error: { code: "P0001", message: "INGESTION_START_LIMIT" } });
    const error = await createReingestReserver(client)(TARGET, OWNER).catch((e) => e);
    expect(error).toBeInstanceOf(IngestionLimitError);
    expect(error.code).toBe("INGESTION_START_LIMIT");
  });

  it("maps a lost target to the shared not-found error", async () => {
    const { client } = rpcClient({ error: { code: "P0002", message: "Target unavailable" } });
    await expect(createReingestReserver(client)(TARGET, OWNER)).rejects.toMatchObject({
      code: "TARGET_NOT_FOUND",
    });
  });

  it.each([
    ["an unknown database error", { error: { code: "23505", message: "duplicate key" } }],
    ["an unknown raised message", { error: { code: "P0001", message: "something else" } }],
    ["a reservation that was not created", { data: { attempt, created: false } }],
    ["a malformed reservation", { data: { created: true } }],
    ["no data", { data: null }],
  ])("treats %s as a storage failure", async (_name, result) => {
    const { client } = rpcClient(result);
    await expect(createReingestReserver(client)(TARGET, OWNER)).rejects.toBeInstanceOf(
      IngestionPersistenceError,
    );
  });
});

describe("beginIngestionReingest", () => {
  const target = {
    id: TARGET,
    ownerId: OWNER,
    name: "Synthetic",
    platform: "google_maps" as const,
    sourceUrl: "https://www.google.com/maps/place/Synthetic",
    googlePlaceId: "ChIJSynthetic",
    createdAt: "2026-11-01T00:00:00Z",
  };
  function deps() {
    return {
      writer: {
        reserve: jest.fn(),
        bind: jest.fn().mockResolvedValue({ ...attempt, provider_request_id: "job" }),
        finish: jest.fn(),
        expireBound: jest.fn(),
        expireUnbound: jest.fn(),
        findForRecovery: jest.fn(),
      },
      reserve: jest.fn().mockResolvedValue({ attempt, created: true }),
      start: jest.fn().mockResolvedValue({ requestId: "job" }),
      storageApproved: true,
      recoveryUrl: jest.fn().mockReturnValue("https://app.example.com/callback"),
      retryDelay: jest.fn().mockResolvedValue(undefined),
    };
  }
  beforeEach(() => {
    jest.mocked(getOwnedTargetOrThrow).mockResolvedValue(target);
    jest.spyOn(console, "info").mockImplementation(() => {});
  });

  it("reserves through the refresh reservation and then submits exactly once", async () => {
    const d = deps();
    const summary = await beginIngestionReingest({} as never, OWNER, TARGET, d as never);
    expect(summary.state).toBe("processing");
    expect(d.reserve).toHaveBeenCalledWith(TARGET, OWNER);
    expect(d.writer.reserve).not.toHaveBeenCalled();
    expect(d.start).toHaveBeenCalledTimes(1);
    expect(d.recoveryUrl).toHaveBeenCalledWith(attempt.id);
    expect(d.writer.bind).toHaveBeenCalledWith(attempt.id, OWNER, "job");
  });

  it("never submits to the provider when the reservation is refused", async () => {
    const d = deps();
    d.reserve.mockRejectedValue(new IngestionReingestError("REINGEST_IN_PROGRESS"));
    await expect(
      beginIngestionReingest({} as never, OWNER, TARGET, d as never),
    ).rejects.toBeInstanceOf(IngestionReingestError);
    expect(d.start).not.toHaveBeenCalled();
    expect(d.writer.finish).not.toHaveBeenCalled();
  });

  it("checks ownership with the session client before reserving", async () => {
    const d = deps();
    jest
      .mocked(getOwnedTargetOrThrow)
      .mockRejectedValue(
        new (jest.requireActual(
          "@/services/analysis-targets/target-ownership",
        ).TargetNotFoundError)(),
      );
    await expect(
      beginIngestionReingest({} as never, OWNER, TARGET, d as never),
    ).rejects.toMatchObject({ code: "TARGET_NOT_FOUND" });
    expect(d.reserve).not.toHaveBeenCalled();
  });
});

function queryClient(result: { data: unknown; error: unknown }) {
  const calls: Array<[string, ...unknown[]]> = [];
  const chain: Record<string, unknown> = {};
  for (const method of ["select", "eq", "order", "limit"])
    chain[method] = (...args: unknown[]) => {
      calls.push([method, ...args]);
      return chain;
    };
  chain.maybeSingle = async () => result;
  const from = jest.fn(() => chain);
  return { client: { from } as never, from, calls };
}
const successRow = {
  id: "attempt-success",
  analysis_target_id: TARGET,
  owner_id: OWNER,
  status: "succeeded",
  started_at: "2026-11-20T12:00:00Z",
  finished_at: "2026-11-20T12:01:00Z",
  saved_count: 7,
};

describe("getLastSuccessfulAttempt", () => {
  it("reads the newest succeeded attempt of the owned target", async () => {
    const { client, from, calls } = queryClient({ data: successRow, error: null });
    await expect(getLastSuccessfulAttempt(client, OWNER, TARGET)).resolves.toEqual(successRow);
    expect(from).toHaveBeenCalledWith("ingestion_attempts");
    expect(calls).toEqual([
      ["select", "id, analysis_target_id, owner_id, status, started_at, finished_at, saved_count"],
      ["eq", "owner_id", OWNER],
      ["eq", "analysis_target_id", TARGET],
      ["eq", "status", "succeeded"],
      ["order", "started_at", { ascending: false }],
      ["order", "id", { ascending: false }],
      ["limit", 1],
    ]);
  });

  it.each([
    ["a failed attempt", { status: "failed" }],
    ["a processing attempt", { status: "processing" }],
    ["another owner's attempt", { owner_id: "someone-else" }],
    ["another target's attempt", { analysis_target_id: "other-target" }],
    ["a detached audit row", { analysis_target_id: null }],
  ])("never presents %s as the dataset", async (_name, override) => {
    const { client } = queryClient({ data: { ...successRow, ...override }, error: null });
    await expect(getLastSuccessfulAttempt(client, OWNER, TARGET)).resolves.toBeNull();
  });

  it("surfaces read failures as storage errors", async () => {
    const { client } = queryClient({ data: null, error: { message: "private" } });
    await expect(getLastSuccessfulAttempt(client, OWNER, TARGET)).rejects.toBeInstanceOf(
      IngestionPersistenceError,
    );
  });
});

describe("loadReingestBaseline", () => {
  const latest = (state: IngestionSummary["state"], extra: Partial<IngestionSummary> = {}) => ({
    ...NO_INGESTION,
    state,
    ...extra,
  });

  it("is undefined when the latest status could not be loaded", async () => {
    const { client, from } = queryClient({ data: successRow, error: null });
    await expect(loadReingestBaseline(client, OWNER, TARGET, null)).resolves.toBeUndefined();
    expect(from).not.toHaveBeenCalled();
  });

  it("is null before anything was collected", async () => {
    const { client, from } = queryClient({ data: successRow, error: null });
    await expect(
      loadReingestBaseline(client, OWNER, TARGET, latest("not_ingested")),
    ).resolves.toBeNull();
    expect(from).not.toHaveBeenCalled();
  });

  it("uses a succeeded latest attempt directly", async () => {
    const { client, from } = queryClient({ data: null, error: null });
    await expect(
      loadReingestBaseline(
        client,
        OWNER,
        TARGET,
        latest("succeeded", { finishedAt: "2026-11-27T10:00:00Z", savedCount: 2 }),
      ),
    ).resolves.toEqual({ finishedAt: "2026-11-27T10:00:00Z", savedCount: 2 });
    expect(from).not.toHaveBeenCalled();
  });

  it.each(["processing", "failed"] as const)(
    "keeps the previous successful dataset while the latest attempt is %s",
    async (state) => {
      const { client } = queryClient({ data: successRow, error: null });
      await expect(loadReingestBaseline(client, OWNER, TARGET, latest(state))).resolves.toEqual({
        finishedAt: "2026-11-20T12:01:00Z",
        savedCount: 7,
      });
    },
  );

  it("is null when a running or failed first collection has no successful attempt", async () => {
    const { client } = queryClient({ data: null, error: null });
    await expect(loadReingestBaseline(client, OWNER, TARGET, latest("failed"))).resolves.toBeNull();
  });

  it("is undefined, with a category-only log, when the read fails", async () => {
    const error = jest.spyOn(console, "error").mockImplementation(() => {});
    const { client } = queryClient({ data: null, error: { message: "private detail" } });
    await expect(
      loadReingestBaseline(client, OWNER, TARGET, latest("processing")),
    ).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledWith("Workspace operation failed", {
      operation: "reingest-baseline",
      category: "LOAD_FAILED",
    });
  });
});
