/** @jest-environment node */
import { GET } from "@/app/api/auth/session/route";
import { getAuthenticatedUser } from "@/services/auth/auth-service";

jest.mock("@/services/auth/auth-service", () => ({ getAuthenticatedUser: jest.fn() }));
jest.mock("next/server", () => ({
  ...jest.requireActual("next/server"),
  connection: jest.fn().mockResolvedValue(undefined),
}));

it("returns only server-verified identity in the shared response shape", async () => {
  const user = { id: "verified-user", email: "test@example.com" };
  jest.mocked(getAuthenticatedUser).mockResolvedValue(user);
  const response = await GET();
  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toContain("no-store");
  await expect(response.json()).resolves.toEqual({ success: true, data: { user } });
});
it("rejects missing identity without returning user data", async () => {
  jest.mocked(getAuthenticatedUser).mockResolvedValue(null);
  const response = await GET();
  expect(response.status).toBe(401);
  await expect(response.json()).resolves.toEqual({
    success: false,
    error: { code: "AUTH_REQUIRED", message: "Please sign in to continue." },
  });
});
it("returns a safe unavailable response for provider failure", async () => {
  jest
    .mocked(getAuthenticatedUser)
    .mockRejectedValue(new Error("private-key-and-provider-details"));
  const response = await GET();
  expect(response.status).toBe(503);
  const body = await response.text();
  expect(body).toContain("AUTH_UNAVAILABLE");
  expect(body).not.toContain("private-key");
});
