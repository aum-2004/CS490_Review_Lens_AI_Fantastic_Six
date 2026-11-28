/** @jest-environment node */

import { POST } from "@/app/api/analysis-targets/[targetId]/ingestion/reingest/route";
import { requireApiUser } from "@/services/auth/access-control";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getOwnedTargetOrThrow,
  TargetNotFoundError,
} from "@/services/analysis-targets/target-ownership";
import { IngestionReingestError } from "@/services/ingestion/ingestion-reingest";
import { reingestErrorMessage } from "@/services/ingestion/ingestion-reingest-state";
import { IngestionLimitError } from "@/services/ingestion/ingestion-limits";
import { ingestionErrorMessage } from "@/services/ingestion/ingestion-state";
import { NextRequest, NextResponse } from "next/server";

jest.mock("@/services/auth/access-control", () => ({ requireApiUser: jest.fn() }));
jest.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: jest.fn() }));
jest.mock("@/lib/supabase/ingestion-admin", () => ({
  createIngestionAdminClient: () => {
    throw new Error("tests must never build a service-role client");
  },
}));
jest.mock("@/services/ingestion/ingestion-recovery", () => ({
  ingestionRecoveryConfigured: () => process.env.TEST_RECOVERY !== "off",
}));
jest.mock("@/services/ingestion/ingestion-runtime", () => ({
  ingestionEnabled: () => process.env.TEST_INGESTION !== "off",
  ingestionStorageApproved: () => process.env.TEST_STORAGE !== "off",
  ingestionDependencies: () => {
    throw new Error("the refresh route must use its own dependencies");
  },
}));
jest.mock("@/services/ingestion/ingestion-reingest", () => ({
  ...jest.requireActual("@/services/ingestion/ingestion-reingest"),
  ingestionReingestDependencies: () => mockDeps,
}));
jest.mock("@/services/analysis-targets/target-ownership", () => ({
  TargetNotFoundError: class TargetNotFoundError extends Error {
    code = "TARGET_NOT_FOUND";
  },
  getOwnedTargetOrThrow: jest.fn(),
}));

const USER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_ID = "22222222-2222-4222-8222-222222222222";
const TARGET_ID = "33333333-3333-4333-8333-333333333333";
const PLACE_ID = "ChIJi9xEDhlZwokRZXXlcZ6Ubkw";
const target = {
  id: TARGET_ID,
  ownerId: USER_ID,
  name: "Cortaditos",
  platform: "google_maps" as const,
  sourceUrl: "https://www.google.com/maps/place/Cortaditos",
  googlePlaceId: PLACE_ID,
  createdAt: "2026-11-06T00:00:00.000Z",
};
const attempt = {
  id: "44444444-4444-4444-8444-444444444444",
  analysis_target_id: TARGET_ID,
  owner_id: USER_ID,
  source_url: target.sourceUrl,
  submitted_query: PLACE_ID,
  query_kind: "place_id" as const,
  expected_place_id: PLACE_ID,
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
const mockDeps = {
  writer: { reserve: jest.fn(), bind: jest.fn(), finish: jest.fn() },
  reserve: jest.fn(),
  start: jest.fn(),
  storageApproved: true,
  recoveryUrl: () => "https://app.example.com/synthetic-callback",
  retryDelay: async () => {},
};
const session = {} as never;

function request(
  init: { headers?: Record<string, string>; body?: string; search?: string } = {},
  id = TARGET_ID,
) {
  return new NextRequest(
    `http://localhost/api/analysis-targets/${id}/ingestion/reingest${init.search ?? ""}`,
    { method: "POST", headers: init.headers, body: init.body },
  );
}
function context(id = TARGET_ID) {
  return { params: Promise.resolve({ targetId: id }) };
}

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.TEST_INGESTION;
  delete process.env.TEST_STORAGE;
  delete process.env.TEST_RECOVERY;
  jest.mocked(requireApiUser).mockResolvedValue({
    user: { id: USER_ID, email: "owner@example.com" },
    response: null,
  } as never);
  jest.mocked(createSupabaseServerClient).mockResolvedValue(session);
  jest.mocked(getOwnedTargetOrThrow).mockResolvedValue(target);
  mockDeps.reserve.mockResolvedValue({ attempt, created: true });
  mockDeps.start.mockResolvedValue({
    status: "accepted",
    requestId: "server-job",
    targetId: TARGET_ID,
    providerStatus: "Pending",
  });
  mockDeps.writer.bind.mockResolvedValue({ ...attempt, provider_request_id: "server-job" });
  jest.spyOn(console, "error").mockImplementation(() => {});
  jest.spyOn(console, "info").mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

function expectPrivate(response: Response) {
  expect(response.headers.get("cache-control")).toBe("private, no-store");
}

it("starts a refresh of an owned analysis through the refresh reservation only", async () => {
  const response = await POST(request(), context());
  expect(response.status).toBe(202);
  expectPrivate(response);
  const body = await response.json();
  expect(body).toEqual({
    success: true,
    data: expect.objectContaining({ state: "processing", savedCount: 0 }),
  });
  expect(JSON.stringify(body)).not.toContain("server-job");
  expect(getOwnedTargetOrThrow).toHaveBeenCalledWith(session, TARGET_ID, USER_ID);
  expect(mockDeps.reserve).toHaveBeenCalledWith(TARGET_ID, USER_ID);
  expect(mockDeps.writer.reserve).not.toHaveBeenCalled();
  expect(mockDeps.start).toHaveBeenCalledTimes(1);
  expect(mockDeps.writer.bind).toHaveBeenCalledWith(attempt.id, USER_ID, "server-job");
});

it("ignores body and query overrides of the owner, target, source, and reviews", async () => {
  const response = await POST(
    request({
      search: `?targetId=${OTHER_ID}&ownerId=${OTHER_ID}&owner_id=${OTHER_ID}`,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        targetId: OTHER_ID,
        ownerId: OTHER_ID,
        owner_id: OTHER_ID,
        sourceUrl: "https://evil.example/place",
        jobId: "attacker-job",
        complete: true,
        reviews: [{ text: "injected", rating: 5 }],
      }),
    }),
    context(),
  );
  expect(response.status).toBe(202);
  expect(getOwnedTargetOrThrow).toHaveBeenCalledWith(session, TARGET_ID, USER_ID);
  expect(mockDeps.reserve).toHaveBeenCalledWith(TARGET_ID, USER_ID);
  expect(mockDeps.start).toHaveBeenCalledWith(
    expect.objectContaining({ id: TARGET_ID, sourceUrl: target.sourceUrl }),
    expect.any(String),
  );
  expect(mockDeps.writer.bind).toHaveBeenCalledWith(attempt.id, USER_ID, "server-job");
  expect(mockDeps.writer.finish).not.toHaveBeenCalled();
});

it("returns one identical 404 for foreign, missing, and malformed targets", async () => {
  const bodies: unknown[] = [];
  for (const id of [OTHER_ID, "55555555-5555-4555-8555-555555555555", "not-a-uuid"]) {
    jest.mocked(getOwnedTargetOrThrow).mockRejectedValueOnce(new TargetNotFoundError());
    const response = await POST(request({}, id), context(id));
    expect(response.status).toBe(404);
    expectPrivate(response);
    bodies.push(await response.json());
  }
  expect(bodies[0]).toEqual({
    success: false,
    error: { code: "TARGET_NOT_FOUND", message: "Analysis target not found." },
  });
  expect(bodies[1]).toEqual(bodies[0]);
  expect(bodies[2]).toEqual(bodies[0]);
  expect(mockDeps.reserve).not.toHaveBeenCalled();
  expect(mockDeps.start).not.toHaveBeenCalled();
});

it("returns the same 404 when ownership is lost before the reservation lock", async () => {
  mockDeps.reserve.mockRejectedValueOnce(new TargetNotFoundError());
  const response = await POST(request(), context());
  expect(response.status).toBe(404);
  expect((await response.json()).error).toEqual({
    code: "TARGET_NOT_FOUND",
    message: "Analysis target not found.",
  });
  expect(mockDeps.start).not.toHaveBeenCalled();
});

it("denies unauthenticated requests before any work", async () => {
  jest.mocked(requireApiUser).mockResolvedValueOnce({
    user: null,
    response: NextResponse.json(
      { success: false, error: { code: "UNAUTHENTICATED", message: "Sign in" } },
      { status: 401 },
    ),
  } as never);
  const response = await POST(request(), context());
  expect(response.status).toBe(401);
  expect(createSupabaseServerClient).not.toHaveBeenCalled();
  expect(mockDeps.reserve).not.toHaveBeenCalled();
});

describe("browser origin", () => {
  it.each([
    ["a different origin", { origin: "https://evil.example" }],
    ["a cross-site fetch", { "sec-fetch-site": "cross-site" }],
    ["an opaque origin", { origin: "null" }],
    ["a non-http origin", { origin: "file://localhost" }],
    [
      "a forwarded host mismatch",
      { origin: "http://localhost", "x-forwarded-host": "app.example" },
    ],
  ])("rejects %s with a fixed 403", async (_name, headers) => {
    const response = await POST(request({ headers }), context());
    expect(response.status).toBe(403);
    expectPrivate(response);
    expect(await response.json()).toEqual({
      success: false,
      error: { code: "FORBIDDEN", message: "This request is not allowed." },
    });
    expect(getOwnedTargetOrThrow).not.toHaveBeenCalled();
    expect(mockDeps.reserve).not.toHaveBeenCalled();
  });

  it.each([
    ["the same host", { origin: "http://localhost", "sec-fetch-site": "same-origin" }],
    [
      "the proxy's forwarded host",
      { origin: "https://reviewlens.example", "x-forwarded-host": "reviewlens.example" },
    ],
    ["a non-browser client without Origin", {}],
  ])("allows %s", async (_name, headers) => {
    const response = await POST(request({ headers }), context());
    expect(response.status).toBe(202);
  });
});

it.each(["REINGEST_IN_PROGRESS", "REINGEST_BLOCKED", "REINGEST_UNAVAILABLE"] as const)(
  "returns a safe 409 for %s without a paid start",
  async (code) => {
    mockDeps.reserve.mockRejectedValueOnce(new IngestionReingestError(code));
    const response = await POST(request(), context());
    expect(response.status).toBe(409);
    expectPrivate(response);
    expect(await response.json()).toEqual({
      success: false,
      error: { code, message: reingestErrorMessage(code) },
    });
    expect(mockDeps.start).not.toHaveBeenCalled();
  },
);

it("returns the existing safe 429 when the daily limit is reached", async () => {
  mockDeps.reserve.mockRejectedValueOnce(new IngestionLimitError("INGESTION_START_LIMIT"));
  const response = await POST(request(), context());
  expect(response.status).toBe(429);
  expectPrivate(response);
  expect(await response.json()).toEqual({
    success: false,
    error: {
      code: "INGESTION_START_LIMIT",
      message: ingestionErrorMessage("INGESTION_START_LIMIT"),
    },
  });
  expect(mockDeps.start).not.toHaveBeenCalled();
});

it.each([
  ["TEST_INGESTION", "INGESTION_DISABLED"],
  ["TEST_STORAGE", "STORAGE_NOT_APPROVED"],
  ["TEST_RECOVERY", "RECOVERY_NOT_CONFIGURED"],
])("keeps the %s gate (%s) before any database work", async (flag, code) => {
  process.env[flag] = "off";
  const response = await POST(request(), context());
  expect(response.status).toBe(503);
  expect((await response.json()).error).toEqual({ code, message: ingestionErrorMessage(code) });
  expect(createSupabaseServerClient).not.toHaveBeenCalled();
  expect(mockDeps.reserve).not.toHaveBeenCalled();
});

it("never leaks an unexpected internal error", async () => {
  mockDeps.reserve.mockRejectedValueOnce(
    Object.assign(new Error("relation secret_table violates something"), { detail: "row data" }),
  );
  const response = await POST(request(), context());
  expect(response.status).toBe(500);
  expectPrivate(response);
  const text = await response.text();
  expect(JSON.parse(text)).toEqual({
    success: false,
    error: {
      code: "REINGEST_START_FAILED",
      message: reingestErrorMessage("REINGEST_START_FAILED"),
    },
  });
  expect(text).not.toMatch(/secret_table|row data/);
  expect(console.error).toHaveBeenCalledWith("Analysis target child operation failed", {
    operation: "reingest",
    category: "UNEXPECTED_ERROR",
  });
});

it("reports a provider rejection as a failed refresh without touching reviews", async () => {
  const { OutscraperError } = jest.requireActual("@/services/ingestion/outscraper-client");
  mockDeps.start.mockRejectedValueOnce(
    Object.assign(new OutscraperError("PROVIDER_REJECTED", "rejected"), {
      submissionRejected: true,
    }),
  );
  mockDeps.writer.finish.mockResolvedValueOnce({
    ...attempt,
    status: "failed",
    finished_at: "2026-11-27T12:00:05Z",
    error_code: "PROVIDER_REJECTED",
  });
  const response = await POST(request(), context());
  expect(response.status).toBe(200);
  expect((await response.json()).data).toEqual(
    expect.objectContaining({ state: "failed", errorCode: "PROVIDER_REJECTED", savedCount: 0 }),
  );
  expect(mockDeps.writer.finish).toHaveBeenCalledWith(
    attempt.id,
    USER_ID,
    [],
    0,
    null,
    "PROVIDER_REJECTED",
  );
});
