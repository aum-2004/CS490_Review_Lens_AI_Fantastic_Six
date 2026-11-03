/** @jest-environment node */
import { createServerClient, type CookieMethodsServer } from "@supabase/ssr";
import { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";
import { getSupabasePublicConfig } from "@/lib/supabase/config";

jest.mock("@supabase/ssr", () => ({ createServerClient: jest.fn() }));
jest.mock("@/lib/supabase/config", () => ({ getSupabasePublicConfig: jest.fn() }));
let cookieAdapter: CookieMethodsServer;
const getClaims = jest.fn();

beforeEach(() => {
  jest.resetAllMocks();
  jest.spyOn(console, "warn").mockImplementation(() => {});
  jest
    .mocked(getSupabasePublicConfig)
    .mockReturnValue({ url: "https://test.supabase.co", publishableKey: "dummy-key" });
  jest.mocked(createServerClient).mockImplementation(((
    _url: string,
    _key: string,
    options: { cookies: CookieMethodsServer },
  ) => {
    cookieAdapter = options.cookies;
    return { auth: { getClaims } };
  }) as unknown as typeof createServerClient);
});
afterEach(() => jest.restoreAllMocks());

it("forwards refreshed cookies to the downstream request and the browser with private headers", async () => {
  const request = new NextRequest("http://localhost/login", {
    headers: { cookie: "session=old-dummy" },
  });
  getClaims.mockImplementation(async () => {
    expect(cookieAdapter.getAll()).toEqual([{ name: "session", value: "old-dummy" }]);
    await cookieAdapter.setAll!(
      [{ name: "session", value: "new-dummy", options: { path: "/", httpOnly: true } }],
      { "Cache-Control": "private, no-store" },
    );
    return { data: {}, error: null };
  });
  const response = await updateSession(request);
  expect(request.cookies.get("session")?.value).toBe("new-dummy");
  expect(response.cookies.get("session")?.value).toBe("new-dummy");
  expect(response.headers.get("x-middleware-request-cookie")).toContain("session=new-dummy");
  expect(response.headers.get("Cache-Control")).toContain("no-store");
  expect(getClaims).toHaveBeenCalledTimes(1);
});
it("keeps cookies from multiple SDK writes", async () => {
  getClaims.mockImplementation(async () => {
    await cookieAdapter.setAll!([{ name: "first", value: "a", options: {} }], {});
    await cookieAdapter.setAll!([{ name: "second", value: "b", options: {} }], {});
  });
  const response = await updateSession(new NextRequest("http://localhost/login"));
  expect(response.cookies.get("first")?.value).toBe("a");
  expect(response.cookies.get("second")?.value).toBe("b");
});
it("lets the page render its safe error state when configuration is missing", async () => {
  jest.mocked(getSupabasePublicConfig).mockImplementation(() => {
    throw new Error("missing");
  });
  const response = await updateSession(new NextRequest("http://localhost/login"));
  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toContain("no-store");
  expect(createServerClient).not.toHaveBeenCalled();
});
it("does not treat refresh failure as authenticated access", async () => {
  getClaims.mockRejectedValue(new Error("private-token-data"));
  const response = await updateSession(new NextRequest("http://localhost/login"));
  expect(response.headers.get("Cache-Control")).toContain("no-store");
  expect(JSON.stringify(jest.mocked(console.warn).mock.calls)).not.toContain("private-token-data");
});
