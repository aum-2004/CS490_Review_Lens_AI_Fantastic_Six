/** @jest-environment node */
import { AuthSessionMissingError } from "@supabase/supabase-js";
import {
  authenticate,
  confirmEmail,
  endSession,
  getAuthenticatedUser,
} from "@/services/auth/auth-service";
import { createSupabaseServerClient } from "@/lib/supabase/server";

jest.mock("server-only", () => ({}));
jest.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: jest.fn() }));

const createClient = jest.mocked(createSupabaseServerClient);
const auth = {
  getUser: jest.fn(),
  signUp: jest.fn(),
  signInWithPassword: jest.fn(),
  signOut: jest.fn(),
  verifyOtp: jest.fn(),
};
const credentials = { email: "user@example.com", password: " test password " };
const user = { id: "verified-user-a", email: credentials.email };
const sessionResponse = { data: { user, session: { access_token: "dummy-token" } }, error: null };

beforeEach(() => {
  jest.resetAllMocks();
  jest.spyOn(console, "warn").mockImplementation(() => {});
  createClient.mockResolvedValue({ auth } as unknown as Awaited<
    ReturnType<typeof createSupabaseServerClient>
  >);
});
afterEach(() => jest.restoreAllMocks());

describe("verified identity", () => {
  it("returns only the verified identity and email, excluding tokens and provider fields", async () => {
    auth.getUser.mockResolvedValue({
      data: { user: { ...user, app_metadata: { private: true } } },
      error: null,
    });
    await expect(getAuthenticatedUser()).resolves.toEqual(user);
    expect(auth.getUser).toHaveBeenCalledTimes(1);
  });
  it("does not retain the previous user's identity between requests", async () => {
    auth.getUser.mockResolvedValueOnce({ data: { user }, error: null }).mockResolvedValueOnce({
      data: { user: { id: "verified-user-b", email: "b@example.com" } },
      error: null,
    });
    expect((await getAuthenticatedUser())?.id).toBe("verified-user-a");
    expect((await getAuthenticatedUser())?.id).toBe("verified-user-b");
    expect(createClient).toHaveBeenCalledTimes(2);
  });
  it("recognizes a missing session", async () => {
    auth.getUser.mockResolvedValue({ data: { user: null }, error: new AuthSessionMissingError() });
    await expect(getAuthenticatedUser()).resolves.toBeNull();
  });
  it.each([401, 403])("rejects an invalid or revoked identity (%s)", async (status) => {
    auth.getUser.mockResolvedValue({ data: { user }, error: { status } });
    await expect(getAuthenticatedUser()).resolves.toBeNull();
  });
  it("returns null when no user is returned", async () => {
    auth.getUser.mockResolvedValue({ data: { user: null }, error: null });
    await expect(getAuthenticatedUser()).resolves.toBeNull();
  });
  it.each(["bad_jwt", "session_expired", "refresh_token_not_found"])(
    "treats %s as unauthenticated even when the provider uses status 400",
    async (code) => {
      auth.getUser.mockResolvedValue({ data: { user: null }, error: { status: 400, code } });
      await expect(getAuthenticatedUser()).resolves.toBeNull();
    },
  );
  it("distinguishes provider outages and hides error details", async () => {
    auth.getUser.mockRejectedValue(new Error("private-provider-diagnostics"));
    await expect(getAuthenticatedUser()).rejects.toThrow(
      "Authentication is temporarily unavailable",
    );
    expect(JSON.stringify(jest.mocked(console.warn).mock.calls)).not.toContain(
      "private-provider-diagnostics",
    );
  });
});

describe("sign-in and registration", () => {
  it.each([null, {}, { email: "bad", password: "" }, { email: "a@example.com", password: 123 }])(
    "rejects invalid input before contacting the provider: %p",
    async (input) => {
      const result = await authenticate(input, "sign-in");
      expect(result.success).toBe(false);
      expect(createClient).not.toHaveBeenCalled();
    },
  );
  it("trims email, preserves password whitespace, and ignores client owner IDs", async () => {
    auth.signInWithPassword.mockResolvedValue(sessionResponse);
    await expect(
      authenticate(
        { ...credentials, email: ` ${credentials.email} `, ownerId: "someone-else" },
        "sign-in",
      ),
    ).resolves.toEqual({ success: true });
    expect(auth.signInWithPassword).toHaveBeenCalledWith(credentials);
    expect(createClient).toHaveBeenCalledWith(true);
  });
  it("does not expose failed credential details or log the submitted password", async () => {
    auth.signInWithPassword.mockResolvedValue({
      data: {},
      error: { status: 400, message: "private-provider-diagnostics" },
    });
    const result = await authenticate(credentials, "sign-in");
    expect(result).toEqual({
      success: false,
      message: "We couldn't sign you in. Check your email and password and try again.",
    });
    expect(JSON.stringify(jest.mocked(console.warn).mock.calls)).not.toMatch(
      /test password|user@example|private-provider/,
    );
  });
  it("handles provider throttling", async () => {
    auth.signInWithPassword.mockResolvedValue({ data: {}, error: { status: 429 } });
    expect((await authenticate(credentials, "sign-in")).message).toContain("Too many attempts");
  });
  it("distinguishes provider server failures from rejected credentials", async () => {
    auth.signInWithPassword.mockResolvedValue({ data: {}, error: { status: 503 } });
    expect(await authenticate(credentials, "sign-in")).toEqual({
      success: false,
      message: "Authentication is temporarily unavailable. Please try again later.",
    });
  });
  it("does not claim success when the provider returns no session", async () => {
    auth.signInWithPassword.mockResolvedValue({ data: { user, session: null }, error: null });
    expect((await authenticate(credentials, "sign-in")).success).toBe(false);
  });
  it("registers without claiming authentication before confirmation", async () => {
    auth.signUp.mockResolvedValue({ data: { user, session: null }, error: null });
    expect(await authenticate(credentials, "register")).toMatchObject({
      success: true,
      requiresConfirmation: true,
    });
    expect(auth.signUp).toHaveBeenCalledWith(credentials);
  });
  it("supports registration when the provider immediately establishes a session", async () => {
    auth.signUp.mockResolvedValue(sessionResponse);
    await expect(authenticate(credentials, "register")).resolves.toEqual({ success: true });
  });
  it("maps registration errors safely", async () => {
    auth.signUp.mockResolvedValue({
      data: {},
      error: { status: 422, message: "sensitive account details" },
    });
    const result = await authenticate(credentials, "register");
    expect(result.success).toBe(false);
    expect(result.message).not.toContain("sensitive account details");
  });
  it("handles missing configuration without returning its details", async () => {
    createClient.mockRejectedValue(new Error("NEXT_PUBLIC_SUPABASE_URL internal details"));
    expect(await authenticate(credentials, "sign-in")).toEqual({
      success: false,
      message: "Authentication is temporarily unavailable. Please try again later.",
    });
  });
});

describe("logout and confirmation", () => {
  it("signs out this session using the provider", async () => {
    auth.signOut.mockResolvedValue({ error: null });
    await expect(endSession()).resolves.toEqual({ success: true });
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
  });
  it("reports failed logout instead of claiming success", async () => {
    auth.signOut.mockResolvedValue({ error: { message: "sensitive" } });
    expect(await endSession()).toEqual({
      success: false,
      message: "We couldn't sign you out. Please try again.",
    });
  });
  it("handles a thrown logout failure safely", async () => {
    auth.signOut.mockRejectedValue(new Error("sensitive"));
    expect((await endSession()).success).toBe(false);
  });
  it("verifies the email token with the SDK", async () => {
    auth.verifyOtp.mockResolvedValue(sessionResponse);
    await expect(confirmEmail("dummy-hash")).resolves.toBe(true);
    expect(auth.verifyOtp).toHaveBeenCalledWith({ token_hash: "dummy-hash", type: "email" });
  });
  it("rejects an expired confirmation token", async () => {
    auth.verifyOtp.mockResolvedValue({ data: { session: null }, error: { status: 403 } });
    await expect(confirmEmail("expired-dummy-hash")).resolves.toBe(false);
  });
});
