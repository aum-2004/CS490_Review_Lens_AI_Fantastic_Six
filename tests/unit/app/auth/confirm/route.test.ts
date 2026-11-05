/** @jest-environment node */
import { NextRequest } from "next/server";
import { GET } from "@/app/auth/confirm/route";
import { confirmEmail } from "@/services/auth/auth-service";

jest.mock("@/services/auth/auth-service", () => ({ confirmEmail: jest.fn() }));
beforeEach(() => jest.resetAllMocks());

it("confirms the email and redirects locally without leaking tokens", async () => {
  jest.mocked(confirmEmail).mockResolvedValue(true);
  const response = await GET(
    new NextRequest(
      "http://localhost/auth/confirm?token_hash=dummy-hash&type=email&next=https://example.com",
    ),
  );
  expect(confirmEmail).toHaveBeenCalledWith("dummy-hash");
  expect(response.headers.get("location")).toBe("http://localhost/login");
  expect(response.headers.get("Cache-Control")).toContain("no-store");
  expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
});
it.each(["", "?type=email", "?token_hash=dummy&type=recovery"])(
  "rejects missing tokens or unsupported confirmation types: %s",
  async (query) => {
    const response = await GET(new NextRequest(`http://localhost/auth/confirm${query}`));
    expect(confirmEmail).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toBe(
      "http://localhost/login?notice=confirmation-error",
    );
  },
);
it("shows a safe notice for expired tokens", async () => {
  jest.mocked(confirmEmail).mockResolvedValue(false);
  const response = await GET(
    new NextRequest("http://localhost/auth/confirm?token_hash=expired-dummy&type=email"),
  );
  expect(response.headers.get("location")).toBe("http://localhost/login?notice=confirmation-error");
});
