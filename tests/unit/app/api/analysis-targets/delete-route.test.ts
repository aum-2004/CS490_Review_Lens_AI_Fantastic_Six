/** @jest-environment node */
import { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DELETE } from "@/app/api/analysis-targets/[targetId]/route";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAuthenticatedUser } from "@/services/auth/auth-service";

jest.mock("server-only", () => ({}));
jest.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: jest.fn() }));
jest.mock("@/services/auth/auth-service", () => ({ getAuthenticatedUser: jest.fn() }));
jest.mock("next/server", () => ({ ...jest.requireActual("next/server"), connection: jest.fn() }));

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1";
const query = { select: jest.fn(), eq: jest.fn(), maybeSingle: jest.fn() };
const rpc = jest.fn();
const client = { from: jest.fn(() => query), rpc };
const read = (id: string, owner = "owner-a") => ({
  id,
  owner_id: owner,
  name: "Synthetic",
  platform: "google_maps",
  source_url: "https://www.google.com/maps/place/Test",
  google_place_id: null,
  created_at: "2026-11-26",
});
const request = (id = A, headers: Record<string, string> = {}, suffix = "") =>
  DELETE(
    new NextRequest(`http://localhost/api/analysis-targets/${id}${suffix}`, {
      method: "DELETE",
      headers,
      body: JSON.stringify({ userId: "owner-b", targetId: B }),
    }),
    { params: Promise.resolve({ targetId: id }) },
  );

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
  query.maybeSingle.mockResolvedValue({ data: read(A), error: null });
  rpc.mockResolvedValue({ data: true, error: null });
});
afterEach(() => jest.restoreAllMocks());

it("authenticates, scopes ownership, and deletes only the URL target using the session client", async () => {
  const response = await request(
    A,
    { origin: "http://localhost" },
    "?ownerId=owner-b&targetId=" + B,
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ success: true, data: { deleted: true } });
  expect(createSupabaseServerClient).toHaveBeenCalledWith(true);
  expect(query.eq.mock.calls).toEqual([
    ["id", A],
    ["owner_id", "owner-a"],
  ]);
  expect(rpc).toHaveBeenCalledTimes(1);
  expect(rpc).toHaveBeenCalledWith("delete_owned_analysis", { p_target_id: A });
  expect(response.headers.get("cache-control")).toBe("private, no-store");
});
it.each([null, "provider failure"])(
  "denies missing identity/provider failure before database access: %s",
  async (value) => {
    if (value) jest.mocked(getAuthenticatedUser).mockRejectedValue(new Error(value));
    else jest.mocked(getAuthenticatedUser).mockResolvedValue(null);
    const response = await request();
    expect(response.status).toBe(value ? 503 : 401);
    expect(createSupabaseServerClient).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  },
);
it.each(["missing", "foreign", "malformed", "wrong-owner-row"])(
  "returns the same 404 for %s and never deletes",
  async (kind) => {
    query.maybeSingle.mockResolvedValue({
      data: kind === "wrong-owner-row" ? read(A, "owner-b") : null,
      error: null,
    });
    const response = await request(kind === "malformed" ? "bad-id" : A);
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      success: false,
      error: { code: "TARGET_NOT_FOUND", message: "Analysis target not found." },
    });
    expect(rpc).not.toHaveBeenCalled();
    if (kind === "malformed") expect(client.from).not.toHaveBeenCalled();
  },
);
it("handles deletion between ownership verification and the atomic RPC as 404", async () => {
  rpc.mockResolvedValue({ data: false, error: null });
  expect((await request()).status).toBe(404);
});
it.each([
  { data: true, error: { message: "SECRET_DATABASE_DETAIL" } },
  { data: null, error: null },
  { data: "true", error: null },
  "throws",
])(
  "fails closed on RPC failure or malformed success without leaking diagnostics: %p",
  async (result) => {
    if (result === "throws") rpc.mockRejectedValue(new Error("SECRET_DATABASE_DETAIL"));
    else rpc.mockResolvedValue(result);
    const response = await request();
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain("SECRET_DATABASE_DETAIL");
    expect(JSON.stringify(jest.mocked(console.error).mock.calls)).not.toContain(
      "SECRET_DATABASE_DETAIL",
    );
  },
);
it("fails safely when ownership lookup fails", async () => {
  query.maybeSingle.mockResolvedValue({ data: null, error: { message: "SECRET_DATABASE_DETAIL" } });
  const response = await request();
  expect(response.status).toBe(500);
  expect(rpc).not.toHaveBeenCalled();
  expect(JSON.stringify(await response.json())).not.toContain("SECRET_DATABASE_DETAIL");
});
it.each<Record<string, string>>([
  { origin: "https://attacker.example" },
  { "sec-fetch-site": "cross-site" },
  { origin: "null" },
  { origin: "not a URL" },
  { origin: "ftp://localhost" },
  { origin: "https://attacker.example", host: "public.example" },
  { origin: "https://public.example", "x-forwarded-host": "other.example" },
  { origin: "https://public.example", "x-forwarded-host": "other.example, public.example" },
  { origin: "https://public.example", "x-forwarded-host": ", public.example" },
  { origin: "https://public.example", host: "public.example", "x-forwarded-host": " " },
  { origin: "https://public.example", "x-forwarded-host": "https://public.example, proxy.example" },
])("rejects a cross-origin browser request before lookup: %p", async (headers) => {
  expect((await request(A, headers)).status).toBe(403);
  expect(client.from).not.toHaveBeenCalled();
  expect(rpc).not.toHaveBeenCalled();
});

it.each<Record<string, string>>([
  { origin: "http://127.0.0.1:3100", host: "127.0.0.1:3100" },
  {
    origin: "https://public.example",
    host: "internal.example",
    "x-forwarded-host": "public.example",
  },
  {
    origin: "https://public.example:8443",
    host: "internal.example",
    "x-forwarded-host": " public.example:8443 , proxy.example",
  },
])("accepts the actual browser-facing host when Next uses an internal URL: %p", async (headers) => {
  expect((await request(A, headers)).status).toBe(200);
  expect(rpc).toHaveBeenCalledTimes(1);
});
