/** @jest-environment node */
import { redirect } from "next/navigation";
import { requireApiUser, requirePageUser } from "@/services/auth/access-control";
import { getAuthenticatedUser } from "@/services/auth/auth-service";

jest.mock("@/services/auth/auth-service", () => ({ getAuthenticatedUser: jest.fn() }));
jest.mock("next/navigation", () => ({ redirect: jest.fn() }));
jest.mock("next/server", () => ({
  ...jest.requireActual("next/server"),
  connection: jest.fn().mockResolvedValue(undefined),
}));

beforeEach(() => {
  jest.resetAllMocks();
  jest.mocked(redirect).mockImplementation(() => {
    throw new Error("NEXT_REDIRECT");
  });
});

it("returns the verified identity to a protected page", async () => {
  const user = { id: "verified-user-a", email: "a@example.com" };
  jest.mocked(getAuthenticatedUser).mockResolvedValue(user);
  await expect(requirePageUser()).resolves.toEqual(user);
  expect(redirect).not.toHaveBeenCalled();
});

it("redirects before returning a user and preserves a safe page destination", async () => {
  jest.mocked(getAuthenticatedUser).mockResolvedValue(null);
  await expect(requirePageUser("/analysis-targets/new")).rejects.toThrow("NEXT_REDIRECT");
  expect(redirect).toHaveBeenCalledWith("/login?next=%2Fanalysis-targets%2Fnew");
});

it("cannot redirect a page to a caller-supplied external URL", async () => {
  jest.mocked(getAuthenticatedUser).mockResolvedValue(null);
  await expect(requirePageUser("https://example.com")).rejects.toThrow("NEXT_REDIRECT");
  expect(redirect).toHaveBeenCalledWith("/login");
});

it("fails closed on page verification outages rather than returning a user", async () => {
  jest.mocked(getAuthenticatedUser).mockRejectedValue(new Error("Authentication unavailable"));
  await expect(requirePageUser()).rejects.toThrow("Authentication unavailable");
  expect(redirect).not.toHaveBeenCalled();
});

it("verifies each backend call independently without sharing identities", async () => {
  jest
    .mocked(getAuthenticatedUser)
    .mockResolvedValueOnce({ id: "verified-user-a", email: null })
    .mockResolvedValueOnce({ id: "verified-user-b", email: null });
  expect((await requireApiUser()).user?.id).toBe("verified-user-a");
  expect((await requireApiUser()).user?.id).toBe("verified-user-b");
  expect(getAuthenticatedUser).toHaveBeenCalledTimes(2);
});

it.each(["missing", "outage"])("does not execute protected work on %s identity", async (state) => {
  if (state === "missing") jest.mocked(getAuthenticatedUser).mockResolvedValue(null);
  else jest.mocked(getAuthenticatedUser).mockRejectedValue(new Error("private-provider-details"));
  const protectedOperation = jest.fn();
  const auth = await requireApiUser();
  if (!auth.response) protectedOperation(auth.user.id);
  expect(protectedOperation).not.toHaveBeenCalled();
  expect(auth.user).toBeUndefined();
  expect(auth.response?.status).toBe(state === "missing" ? 401 : 503);
  expect(auth.response?.headers.get("Cache-Control")).toContain("no-store");
  const body = await auth.response!.json();
  expect(body).not.toHaveProperty("data");
  expect(body.error.code).toBe(state === "missing" ? "AUTH_REQUIRED" : "AUTH_UNAVAILABLE");
  expect(JSON.stringify(body)).not.toContain("private-provider-details");
});
