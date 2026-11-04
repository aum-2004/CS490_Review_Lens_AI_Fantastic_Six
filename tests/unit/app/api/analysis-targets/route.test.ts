/** @jest-environment node */
import { POST } from "@/app/api/analysis-targets/route";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAuthenticatedUser } from "@/services/auth/auth-service";

jest.mock("@/services/auth/auth-service", () => ({ getAuthenticatedUser: jest.fn() }));
jest.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: jest.fn() }));
jest.mock("next/server", () => ({
  ...jest.requireActual("next/server"),
  connection: jest.fn().mockResolvedValue(undefined),
}));

const USER_A = { id: "11111111-1111-4111-8111-111111111111", email: "a@example.com" };
const USER_B = { id: "22222222-2222-4222-8222-222222222222", email: "b@example.com" };
const SOURCE_URL = "https://www.google.com/maps/place/Joe's+Pizza";
const validBody = { name: "Joe's Pizza", sourceUrl: SOURCE_URL };

// The real guard and repository run; only the database client is fake, so these tests assert the
// exact row the handler sends to Supabase.
function useDatabase(result?: { data: unknown; error: unknown }) {
  const insert = jest.fn((row: Record<string, unknown>) => ({
    select: () => ({
      single: async () =>
        result ?? {
          data: { id: "33333333-3333-4333-8333-333333333333", created_at: "2026-11-04", ...row },
          error: null,
        },
    }),
  }));
  const from = jest.fn(() => ({ insert }));
  jest.mocked(createSupabaseServerClient).mockResolvedValue({ from } as never);
  return { from, insert };
}

function post(body: unknown) {
  return POST(
    new Request("http://localhost/api/analysis-targets", {
      method: "POST",
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, "error").mockImplementation(() => {});
});

describe("ownership", () => {
  it("persists the verified user as owner and returns the created target", async () => {
    jest.mocked(getAuthenticatedUser).mockResolvedValue(USER_A);
    const { from, insert } = useDatabase();

    const response = await post(validBody);

    expect(response.status).toBe(201);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(from).toHaveBeenCalledWith("analysis_targets");
    expect(insert).toHaveBeenCalledWith({
      owner_id: USER_A.id,
      name: "Joe's Pizza",
      platform: "google_maps",
      source_url: SOURCE_URL,
      google_place_id: null,
    });
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: { ownerId: USER_A.id, name: "Joe's Pizza", platform: "google_maps" },
    });
  });

  it.each(["ownerId", "owner_id", "userId", "user_id"])(
    "ignores another user's ID submitted as %s",
    async (field) => {
      jest.mocked(getAuthenticatedUser).mockResolvedValue(USER_A);
      const { insert } = useDatabase();

      const response = await post({ ...validBody, [field]: USER_B.id });

      expect(response.status).toBe(201);
      expect(insert.mock.calls[0][0].owner_id).toBe(USER_A.id);
      expect(JSON.stringify(insert.mock.calls)).not.toContain(USER_B.id);
    },
  );

  it("does not let submitted fields set database columns", async () => {
    jest.mocked(getAuthenticatedUser).mockResolvedValue(USER_A);
    const { insert } = useDatabase();

    await post({ ...validBody, id: "attacker-id", created_at: "2000-01-01", platform: "other" });

    expect(insert.mock.calls[0][0]).toEqual({
      owner_id: USER_A.id,
      name: "Joe's Pizza",
      platform: "google_maps",
      source_url: SOURCE_URL,
      google_place_id: null,
    });
  });

  it("uses each request's own verified identity for an identical body", async () => {
    const { insert } = useDatabase();

    jest.mocked(getAuthenticatedUser).mockResolvedValue(USER_A);
    await post(validBody);
    jest.mocked(getAuthenticatedUser).mockResolvedValue(USER_B);
    await post(validBody);

    expect(insert.mock.calls.map(([row]) => row.owner_id)).toEqual([USER_A.id, USER_B.id]);
  });

  it("uses a session-scoped client so Row Level Security also checks the owner", async () => {
    jest.mocked(getAuthenticatedUser).mockResolvedValue(USER_A);
    useDatabase();

    await post(validBody);

    expect(createSupabaseServerClient).toHaveBeenCalledWith(true);
  });
});

describe("authentication", () => {
  it("rejects a missing session before any database work, even with a submitted owner", async () => {
    jest.mocked(getAuthenticatedUser).mockResolvedValue(null);
    const { insert } = useDatabase();

    const response = await post({ ...validBody, ownerId: USER_A.id });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: { code: "AUTH_REQUIRED", message: "Please sign in to continue." },
    });
    expect(createSupabaseServerClient).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it("fails closed when identity cannot be verified", async () => {
    jest.mocked(getAuthenticatedUser).mockRejectedValue(new Error("provider-secret-details"));
    const { insert } = useDatabase();

    const response = await post(validBody);

    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("provider-secret-details");
    expect(insert).not.toHaveBeenCalled();
  });
});

describe("validation", () => {
  beforeEach(() => {
    jest.mocked(getAuthenticatedUser).mockResolvedValue(USER_A);
  });

  it("returns field issues and writes nothing for invalid input", async () => {
    const { insert } = useDatabase();

    const response = await post({ name: " ", sourceUrl: "https://example.com" });

    expect(response.status).toBe(400);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: {
        code: "INVALID_ANALYSIS_TARGET_INPUT",
        issues: [
          { field: "name", code: "TARGET_NAME_REQUIRED" },
          { field: "sourceUrl", code: "SOURCE_URL_UNSUPPORTED_PLATFORM" },
        ],
      },
    });
    expect(insert).not.toHaveBeenCalled();
  });

  it("treats malformed JSON as invalid input", async () => {
    const { insert } = useDatabase();

    const response = await post("{not json");

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "INVALID_ANALYSIS_TARGET_INPUT" },
    });
    expect(insert).not.toHaveBeenCalled();
  });
});

describe("persistence failures", () => {
  beforeEach(() => {
    jest.mocked(getAuthenticatedUser).mockResolvedValue(USER_A);
  });

  it("returns a generic error and logs no database details when the write is denied", async () => {
    useDatabase({ data: null, error: { message: "new row violates row-level security policy" } });

    const response = await post(validBody);

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toEqual({
      success: false,
      error: {
        code: "ANALYSIS_TARGET_CREATION_FAILED",
        message: "We couldn't create this target. Please try again.",
      },
    });
    expect(console.error).toHaveBeenCalledWith("Analysis target operation failed", {
      operation: "create",
      category: "ANALYSIS_TARGET_PERSISTENCE_FAILED",
    });
    expect(JSON.stringify(jest.mocked(console.error).mock.calls)).not.toContain("row-level");
  });

  it("returns the same generic error when the database client cannot be created", async () => {
    jest.mocked(createSupabaseServerClient).mockRejectedValue(new Error("missing configuration"));

    const response = await post(validBody);

    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("missing configuration");
    expect(console.error).toHaveBeenCalledWith("Analysis target operation failed", {
      operation: "create",
      category: "UNEXPECTED_ERROR",
    });
  });
});
