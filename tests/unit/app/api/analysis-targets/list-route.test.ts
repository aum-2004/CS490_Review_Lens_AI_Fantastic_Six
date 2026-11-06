/** @jest-environment node */
import { GET } from "@/app/api/analysis-targets/route";
import { getAuthenticatedUser } from "@/services/auth/auth-service";
import { createSupabaseServerClient } from "@/lib/supabase/server";

jest.mock("@/services/auth/auth-service", () => ({ getAuthenticatedUser: jest.fn() }));
jest.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: jest.fn() }));
jest.mock("next/server", () => ({
  ...jest.requireActual("next/server"),
  connection: jest.fn().mockResolvedValue(undefined),
}));

const A = { id: "11111111-1111-4111-8111-111111111111", email: null };
const B = { id: "22222222-2222-4222-8222-222222222222", email: null };
function database(fail = false) {
  const owners: string[] = [];
  const from = jest.fn(() => {
    let owner = "";
    const builder = {
      select: () => builder,
      eq: (_column: string, value: string) => {
        owner = value;
        owners.push(value);
        return builder;
      },
      order: () => builder,
      range: async (start: number) =>
        fail
          ? { data: null, error: { message: "private SQL and credentials" } }
          : {
              data:
                start === 0
                  ? [
                      {
                        id: owner === A.id ? "a" : "b",
                        name: owner === A.id ? "A target" : "B target",
                        platform: "google_maps",
                        source_url: "https://www.google.com/maps/place/Fixture",
                        created_at: "2026-11-01",
                      },
                    ]
                  : [],
              error: null,
            },
    };
    return builder;
  });
  jest.mocked(createSupabaseServerClient).mockResolvedValue({ from } as never);
  return { from, owners };
}
beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, "error").mockImplementation(() => {});
});

it("uses each call's server-verified identity and never returns the other owner's target", async () => {
  const db = database();
  for (const user of [A, B]) {
    jest.mocked(getAuthenticatedUser).mockResolvedValue(user);
    const response = await GET();
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(body.success).toBe(true);
    expect(body.data.map((target: { name: string }) => target.name)).toEqual([
      user === A ? "A target" : "B target",
    ]);
    expect(body.data[0]).not.toHaveProperty("ownerId");
  }
  expect(db.owners).toEqual([A.id, A.id, B.id, B.id]);
  expect(createSupabaseServerClient).toHaveBeenCalledWith(true);
});

it("rejects anonymous access before constructing a database client", async () => {
  jest.mocked(getAuthenticatedUser).mockResolvedValue(null);
  const db = database();
  const response = await GET();
  expect(response.status).toBe(401);
  expect(await response.json()).toEqual({
    success: false,
    error: { code: "AUTH_REQUIRED", message: "Please sign in to continue." },
  });
  expect(createSupabaseServerClient).not.toHaveBeenCalled();
  expect(db.from).not.toHaveBeenCalled();
});

it("fails closed on an identity verification outage before database work", async () => {
  jest.mocked(getAuthenticatedUser).mockRejectedValue(new Error("private auth error"));
  const db = database();
  const response = await GET();
  expect(response.status).toBe(503);
  expect(JSON.stringify(await response.json())).not.toMatch(/private|data/);
  expect(db.from).not.toHaveBeenCalled();
});

it("returns a private, generic database failure and logs no provider details", async () => {
  jest.mocked(getAuthenticatedUser).mockResolvedValue(A);
  database(true);
  const response = await GET();
  expect(response.status).toBe(500);
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  expect(await response.json()).toEqual({
    success: false,
    error: {
      code: "ANALYSIS_TARGET_LIST_FAILED",
      message: "We couldn't load your targets. Please try again.",
    },
  });
  expect(JSON.stringify(jest.mocked(console.error).mock.calls)).not.toContain("credentials");
});
