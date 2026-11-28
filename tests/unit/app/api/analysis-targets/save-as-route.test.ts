/** @jest-environment node */

// S3-003: POST /api/analysis-targets/[targetId]/save-as copies only the caller's own analysis.
import { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { POST } from "@/app/api/analysis-targets/[targetId]/save-as/route";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAuthenticatedUser } from "@/services/auth/auth-service";

jest.mock("server-only", () => ({}));
jest.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: jest.fn() }));
jest.mock("@/services/auth/auth-service", () => ({ getAuthenticatedUser: jest.fn() }));
jest.mock("next/server", () => ({ ...jest.requireActual("next/server"), connection: jest.fn() }));

const SOURCE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const COPY = "cccccccc-cccc-4ccc-8ccc-ccccccccccc1";
const query = { select: jest.fn(), eq: jest.fn(), maybeSingle: jest.fn() };
const rpc = jest.fn();
const client = { from: jest.fn(() => query), rpc };
const row = (id: string, name: string, owner = "owner-a") => ({
  id,
  owner_id: owner,
  name,
  platform: "google_maps",
  source_url: "https://www.google.com/maps/place/Bakery",
  google_place_id: null,
  created_at: "2026-11-28",
});

function post(
  body: unknown = { name: "Weekend copy" },
  headers: Record<string, string> = { "content-type": "application/json" },
  id = SOURCE,
) {
  return POST(
    new NextRequest(`http://localhost/api/analysis-targets/${id}/save-as`, {
      method: "POST",
      headers,
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
    { params: Promise.resolve({ targetId: id }) } as never,
  );
}

beforeEach(() => {
  jest.resetAllMocks();
  jest.spyOn(console, "error").mockImplementation(() => undefined);
  jest
    .mocked(getAuthenticatedUser)
    .mockResolvedValue({ id: "owner-a", email: "synthetic@example.com" });
  jest.mocked(createSupabaseServerClient).mockResolvedValue(client as unknown as SupabaseClient);
  client.from.mockReturnValue(query);
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.maybeSingle
    .mockResolvedValueOnce({ data: row(SOURCE, "Bakery"), error: null })
    .mockResolvedValueOnce({ data: row(COPY, "Weekend copy"), error: null });
  rpc.mockResolvedValue({ data: COPY, error: null });
});
afterEach(() => jest.restoreAllMocks());

it("copies the owned analysis with the validated name and returns the new analysis", async () => {
  const response = await post({ name: "  Weekend copy  ", ownerId: "owner-b", sourceUrl: "x" });
  expect(response.status).toBe(201);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(await response.json()).toEqual({
    success: true,
    data: {
      id: COPY,
      name: "Weekend copy",
      sourceUrl: "https://www.google.com/maps/place/Bakery",
      platform: "google_maps",
    },
  });
  expect(createSupabaseServerClient).toHaveBeenCalledWith(true);
  expect(rpc).toHaveBeenCalledTimes(1);
  expect(rpc).toHaveBeenCalledWith("save_analysis_as", {
    p_source_target_id: SOURCE,
    p_name: "Weekend copy",
  });
  expect(query.eq.mock.calls).toEqual([
    ["id", SOURCE],
    ["owner_id", "owner-a"],
    ["id", COPY],
    ["owner_id", "owner-a"],
  ]);
});

it("requires a signed-in user", async () => {
  jest.mocked(getAuthenticatedUser).mockResolvedValue(null);
  const response = await post();
  expect(response.status).toBe(401);
  expect(rpc).not.toHaveBeenCalled();
});

it("rejects non-JSON requests before any database work", async () => {
  const response = await post("name=Copy", { "content-type": "application/x-www-form-urlencoded" });
  expect(response.status).toBe(415);
  expect(createSupabaseServerClient).not.toHaveBeenCalled();
});

it.each([
  [
    "a foreign analysis",
    () => query.maybeSingle.mockReset().mockResolvedValue({ data: null, error: null }),
    SOURCE,
  ],
  ["a malformed id", () => undefined, "not-a-uuid"],
])("denies %s with the standard not-found response", async (_case, arrange, id) => {
  arrange();
  const response = await post(undefined, undefined, id);
  expect(response.status).toBe(404);
  expect((await response.json()).error.code).toBe("TARGET_NOT_FOUND");
  expect(rpc).not.toHaveBeenCalled();
});

it("maps a source deleted after the ownership check to not found", async () => {
  rpc.mockResolvedValue({ data: null, error: { code: "P0002", message: "Target unavailable" } });
  const response = await post();
  expect(response.status).toBe(404);
});

it.each([
  [{ name: "   " }, "TARGET_NAME_REQUIRED"],
  [{ name: "x".repeat(121) }, "TARGET_NAME_TOO_LONG"],
  [{ name: "Bad\u0007" }, "TARGET_NAME_INVALID_CHARACTERS"],
  [{}, "TARGET_NAME_REQUIRED"],
  ["not json", "INVALID_INPUT_TYPE"],
])("rejects an invalid name (%p) without copying", async (body, code) => {
  const response = await post(body);
  expect(response.status).toBe(400);
  expect((await response.json()).error.issues[0].code).toBe(code);
  expect(rpc).not.toHaveBeenCalled();
});

it("rejects an oversized body", async () => {
  const response = await post({ name: "x".repeat(5_000) });
  expect(response.status).toBe(413);
  expect(rpc).not.toHaveBeenCalled();
});

it("reports the analysis limit as a conflict", async () => {
  rpc.mockResolvedValue({ data: null, error: { code: "P0001", message: "ANALYSIS_LIMIT" } });
  const response = await post();
  expect(response.status).toBe(409);
  expect((await response.json()).error).toEqual({
    code: "ANALYSIS_LIMIT",
    message:
      "You've reached the limit of 200 analyses. Delete an analysis before saving another copy.",
  });
});

it.each([
  [
    "a database error",
    () =>
      rpc.mockResolvedValue({ data: null, error: { code: "XX000", message: "db at 10.0.0.1" } }),
  ],
  [
    "a copy that cannot be read back",
    () =>
      query.maybeSingle
        .mockReset()
        .mockResolvedValueOnce({ data: row(SOURCE, "Bakery"), error: null })
        .mockResolvedValueOnce({ data: null, error: null }),
  ],
])("returns a generic failure for %s", async (_case, arrange) => {
  arrange();
  const response = await post();
  const body = await response.json();
  expect(response.status).toBe(500);
  expect(body.error.code).toBe("SAVE_AS_FAILED");
  expect(JSON.stringify(body)).not.toContain("10.0.0.1");
});
