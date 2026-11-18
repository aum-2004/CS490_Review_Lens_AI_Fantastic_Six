/** @jest-environment node */
import { HomeDestination } from "@/components/shared/HomeDestination";
import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/services/auth/auth-service";

jest.mock("@/services/auth/auth-service", () => ({ getAuthenticatedUser: jest.fn() }));
jest.mock("next/navigation", () => ({ redirect: jest.fn() }));
jest.mock("next/server", () => ({ connection: jest.fn().mockResolvedValue(undefined) }));

beforeEach(() => {
  jest.resetAllMocks();
  jest.mocked(redirect).mockImplementation(() => {
    throw new Error("NEXT_REDIRECT");
  });
});

it.each([true, false])("routes home using verified identity: %s", async (signedIn) => {
  jest
    .mocked(getAuthenticatedUser)
    .mockResolvedValue(signedIn ? { id: "verified", email: null } : null);
  await expect(HomeDestination()).rejects.toThrow("NEXT_REDIRECT");
  expect(redirect).toHaveBeenCalledWith(signedIn ? "/analysis-targets" : "/login");
});

it("fails closed to login on an authentication outage", async () => {
  jest.mocked(getAuthenticatedUser).mockRejectedValue(new Error("private-provider-error"));
  await expect(HomeDestination()).rejects.toThrow("NEXT_REDIRECT");
  expect(redirect).toHaveBeenCalledWith("/login");
});
