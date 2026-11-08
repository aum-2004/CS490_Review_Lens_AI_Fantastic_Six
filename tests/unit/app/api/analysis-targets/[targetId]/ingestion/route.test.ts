/** @jest-environment node */

import { POST } from "@/app/api/analysis-targets/[targetId]/ingestion/route";
import { requireApiUser } from "@/services/auth/access-control";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getOwnedTargetOrThrow,
  TargetNotFoundError,
} from "@/services/analysis-targets/target-ownership";
import { startOutscraperExtraction } from "@/services/ingestion/outscraper-client";
import { NextRequest, NextResponse } from "next/server";
import { IngestionLimitError } from "@/services/ingestion/ingestion-limits";

jest.mock("@/services/auth/access-control", () => ({ requireApiUser: jest.fn() }));
jest.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: jest.fn() }));
jest.mock("@/services/ingestion/ingestion-recovery", () => ({
  ingestionRecoveryConfigured: () => true,
}));
jest.mock("@/services/ingestion/ingestion-runtime", () => ({
  ingestionEnabled: () => process.env.INGESTION_ENABLED === "true",
  ingestionStorageApproved: () => true,
  ingestionDependencies: () => ({
    writer: mockWriter,
    storageApproved: true,
    recoveryUrl: () => "https://app.example.com/synthetic-callback",
    retryDelay: async () => {},
  }),
}));
jest.mock("@/services/analysis-targets/target-ownership", () => ({
  TargetNotFoundError: class TargetNotFoundError extends Error {
    code = "TARGET_NOT_FOUND";
  },
  getOwnedTargetOrThrow: jest.fn(),
}));
jest.mock("@/services/ingestion/outscraper-client", () => ({
  OutscraperError: class OutscraperError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  },
  startOutscraperExtraction: jest.fn(),
}));

const USER_ID = "11111111-1111-4111-8111-111111111111";
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

const originalIngestionEnabled = process.env.INGESTION_ENABLED;
let mockAttempt: Record<string, unknown>;
const mockWriter = { reserve: jest.fn(), bind: jest.fn(), finish: jest.fn() };

function context() {
  return { params: Promise.resolve({ targetId: TARGET_ID }) };
}

it("returns safe 429 feedback before a paid start when the owner cap is reached", async () => {
  mockWriter.reserve.mockRejectedValueOnce(new IngestionLimitError("INGESTION_START_LIMIT"));
  const response = await POST(
    new NextRequest("http://localhost/api/analysis-targets/" + TARGET_ID + "/ingestion", {
      method: "POST",
    }),
    context(),
  );
  expect(response.status).toBe(429);
  expect((await response.json()).error.code).toBe("INGESTION_START_LIMIT");
  expect(startOutscraperExtraction).not.toHaveBeenCalled();
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, "info").mockImplementation(() => {});
  jest.spyOn(console, "error").mockImplementation(() => {});
  process.env.INGESTION_ENABLED = "true";
  jest.mocked(requireApiUser).mockResolvedValue({ user: { id: USER_ID, email: null } });
  jest.mocked(createSupabaseServerClient).mockResolvedValue({} as never);
  jest.mocked(getOwnedTargetOrThrow).mockResolvedValue(target);
  jest.mocked(startOutscraperExtraction).mockResolvedValue({ id: "job-1", status: "Pending" });
  mockWriter.reserve.mockImplementation(async (targetId, ownerId) => {
    const owned = await getOwnedTargetOrThrow({} as never, targetId, ownerId);
    mockAttempt = {
      id: TARGET_ID,
      analysis_target_id: targetId,
      owner_id: ownerId,
      source_url: owned.sourceUrl,
      expected_place_id: owned.googlePlaceId,
      submitted_query: owned.googlePlaceId ?? owned.sourceUrl,
      query_kind: owned.googlePlaceId ? "place_id" : "source_url",
      provider_request_id: null,
      status: "processing",
      started_at: "2026-11-06T00:00:00Z",
      finished_at: null,
      saved_count: 0,
      skipped_count: 0,
      error_code: null,
      identity_basis: null,
      verified_identity: null,
    };
    return { attempt: mockAttempt, created: true };
  });
  mockWriter.bind.mockImplementation(async (_id, _owner, jobId) => ({
    ...mockAttempt,
    provider_request_id: jobId,
  }));
  mockWriter.finish.mockImplementation(
    async (_id, _owner, _reviews, _skipped, _identity, code) => ({
      ...mockAttempt,
      status: "failed",
      error_code: code,
    }),
  );
});
afterEach(() => jest.restoreAllMocks());

afterAll(() => {
  if (originalIngestionEnabled === undefined) delete process.env.INGESTION_ENABLED;
  else process.env.INGESTION_ENABLED = originalIngestionEnabled;
});

it("keeps ingestion disabled by default and does not start repeated provider jobs", async () => {
  delete process.env.INGESTION_ENABLED;

  const responses = await Promise.all(
    Array.from({ length: 3 }, () => POST(new NextRequest("http://localhost"), context())),
  );

  expect(responses.map((response) => response.status)).toEqual([503, 503, 503]);
  expect(getOwnedTargetOrThrow).not.toHaveBeenCalled();
  expect(startOutscraperExtraction).not.toHaveBeenCalled();
  await expect(responses[0].json()).resolves.toMatchObject({
    success: false,
    error: { code: "INGESTION_DISABLED" },
  });
});

it("returns the auth response and performs no lookup when unauthenticated", async () => {
  jest.mocked(requireApiUser).mockResolvedValue({
    response: NextResponse.json(
      { success: false, error: { code: "AUTH_REQUIRED" } },
      { status: 401 },
    ),
  });

  const response = await POST(new NextRequest("http://localhost"), context());

  expect(response.status).toBe(401);
  expect(getOwnedTargetOrThrow).not.toHaveBeenCalled();
  expect(startOutscraperExtraction).not.toHaveBeenCalled();
});

it.each([
  [null, 404],
  [{ ...target, ownerId: "22222222-2222-4222-8222-222222222222" }, 404],
])("rejects target/source failure before provider access", async (foundTarget, status) => {
  if (foundTarget === null) {
    jest.mocked(getOwnedTargetOrThrow).mockRejectedValue(new TargetNotFoundError());
  } else {
    jest.mocked(getOwnedTargetOrThrow).mockResolvedValue(foundTarget);
  }

  const response = await POST(new NextRequest("http://localhost"), context());

  expect(response.status).toBe(status);
  expect(startOutscraperExtraction).not.toHaveBeenCalled();
});

it("rejects an invalid stored source before provider access", async () => {
  jest.mocked(getOwnedTargetOrThrow).mockResolvedValue({
    ...target,
    googlePlaceId: null,
    sourceUrl: "https://example.com/not-google-maps",
  });

  const response = await POST(new NextRequest("http://localhost"), context());

  expect(response.status).toBe(422);
  expect(startOutscraperExtraction).not.toHaveBeenCalled();
});

it("returns 202 and starts extraction only after the owned target is loaded", async () => {
  const response = await POST(new NextRequest("http://localhost"), context());

  expect(response.status).toBe(202);
  await expect(response.json()).resolves.toEqual({
    success: true,
    data: {
      state: "processing",
      startedAt: "2026-11-06T00:00:00Z",
      finishedAt: null,
      savedCount: 0,
      skippedCount: 0,
      errorCode: null,
      identityBasis: null,
      providerBusinessName: null,
    },
  });
  expect(getOwnedTargetOrThrow).toHaveBeenCalledWith({}, TARGET_ID, USER_ID);
  expect(startOutscraperExtraction).toHaveBeenCalledWith(
    { kind: "place_id", value: PLACE_ID },
    undefined,
    "https://app.example.com/synthetic-callback",
  );
  expect(mockWriter.reserve.mock.invocationCallOrder[0]).toBeLessThan(
    jest.mocked(startOutscraperExtraction).mock.invocationCallOrder[0],
  );
  expect(mockWriter.bind).toHaveBeenCalledWith(TARGET_ID, USER_ID, "job-1");
});

it("submits a stored Google Maps URL when the target has no Place ID", async () => {
  jest.mocked(getOwnedTargetOrThrow).mockResolvedValue({ ...target, googlePlaceId: null });

  const response = await POST(new NextRequest("http://localhost"), context());

  expect(response.status).toBe(202);
  expect(startOutscraperExtraction).toHaveBeenCalledWith(
    {
      kind: "source_url",
      value: target.sourceUrl,
    },
    undefined,
    "https://app.example.com/synthetic-callback",
  );
});

it("returns a safe provider failure", async () => {
  jest.mocked(startOutscraperExtraction).mockRejectedValue(new Error("provider failure"));

  const response = await POST(new NextRequest("http://localhost"), context());

  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.data).toMatchObject({
    state: "failed",
    savedCount: 0,
    errorCode: "SUBMISSION_UNCERTAIN",
  });
  expect(JSON.stringify(body)).not.toContain("provider failure");
});

it("returns a safe error when the Supabase client cannot be initialized", async () => {
  jest.mocked(createSupabaseServerClient).mockRejectedValue(new Error("supabase secret details"));

  const response = await POST(new NextRequest("http://localhost"), context());

  expect(response.status).toBe(500);
  await expect(response.text()).resolves.not.toContain("supabase secret details");
  expect(getOwnedTargetOrThrow).not.toHaveBeenCalled();
  expect(startOutscraperExtraction).not.toHaveBeenCalled();
});
