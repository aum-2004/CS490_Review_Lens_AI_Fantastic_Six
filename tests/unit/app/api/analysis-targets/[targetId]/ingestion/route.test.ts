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

jest.mock("@/services/auth/access-control", () => ({ requireApiUser: jest.fn() }));
jest.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: jest.fn() }));
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

function context() {
  return { params: Promise.resolve({ targetId: TARGET_ID }) };
}

beforeEach(() => {
  process.env.INGESTION_ENABLED = "true";
  jest.mocked(requireApiUser).mockResolvedValue({ user: { id: USER_ID, email: null } });
  jest.mocked(createSupabaseServerClient).mockResolvedValue({} as never);
  jest.mocked(getOwnedTargetOrThrow).mockResolvedValue(target);
  jest.mocked(startOutscraperExtraction).mockResolvedValue({ id: "job-1", status: "Pending" });
});

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
      status: "accepted",
      targetId: TARGET_ID,
      requestId: "job-1",
      providerStatus: "Pending",
    },
  });
  expect(getOwnedTargetOrThrow).toHaveBeenCalledWith({}, TARGET_ID, USER_ID);
  expect(startOutscraperExtraction).toHaveBeenCalledWith({ kind: "place_id", value: PLACE_ID });
});

it("submits a stored Google Maps URL when the target has no Place ID", async () => {
  jest.mocked(getOwnedTargetOrThrow).mockResolvedValue({ ...target, googlePlaceId: null });

  const response = await POST(new NextRequest("http://localhost"), context());

  expect(response.status).toBe(202);
  expect(startOutscraperExtraction).toHaveBeenCalledWith({
    kind: "source_url",
    value: target.sourceUrl,
  });
});

it("returns a safe provider failure", async () => {
  jest.mocked(startOutscraperExtraction).mockRejectedValue(new Error("provider failure"));

  const response = await POST(new NextRequest("http://localhost"), context());

  expect(response.status).toBe(500);
  await expect(response.text()).resolves.not.toContain("provider failure");
});

it("returns a safe error when the Supabase client cannot be initialized", async () => {
  jest.mocked(createSupabaseServerClient).mockRejectedValue(new Error("supabase secret details"));

  const response = await POST(new NextRequest("http://localhost"), context());

  expect(response.status).toBe(500);
  await expect(response.text()).resolves.not.toContain("supabase secret details");
  expect(getOwnedTargetOrThrow).not.toHaveBeenCalled();
  expect(startOutscraperExtraction).not.toHaveBeenCalled();
});
