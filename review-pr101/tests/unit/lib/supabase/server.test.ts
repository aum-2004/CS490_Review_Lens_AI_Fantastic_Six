/** @jest-environment node */
import { createServerClient, type CookieMethodsServer } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabasePublicConfig } from "@/lib/supabase/config";

jest.mock("server-only", () => ({}));
jest.mock("@supabase/ssr", () => ({ createServerClient: jest.fn() }));
jest.mock("next/headers", () => ({ cookies: jest.fn() }));
jest.mock("@/lib/supabase/config", () => ({ getSupabasePublicConfig: jest.fn() }));

const store = { getAll: jest.fn(), set: jest.fn() };
beforeEach(() => {
  jest.resetAllMocks();
  jest
    .mocked(getSupabasePublicConfig)
    .mockReturnValue({ url: "https://test.supabase.co", publishableKey: "dummy-key" });
  jest.mocked(cookies).mockResolvedValue(store as unknown as Awaited<ReturnType<typeof cookies>>);
});
function adapter() {
  return jest.mocked(createServerClient).mock.calls[0][2].cookies as CookieMethodsServer;
}

it("reads cookies while preventing writes during Server Component rendering", async () => {
  store.getAll.mockReturnValue([{ name: "session", value: "dummy" }]);
  await createSupabaseServerClient();
  expect(adapter().getAll()).toEqual([{ name: "session", value: "dummy" }]);
  expect(adapter().setAll).toBeUndefined();
});
it("persists SDK cookies and clearing options in actions/handlers", async () => {
  await createSupabaseServerClient(true);
  adapter().setAll!([{ name: "session", value: "", options: { path: "/", maxAge: 0 } }], {});
  expect(store.set).toHaveBeenCalledWith("session", "", { path: "/", maxAge: 0 });
});
it("does not silently swallow failed cookie writes", async () => {
  store.set.mockImplementation(() => {
    throw new Error("write failed");
  });
  await createSupabaseServerClient(true);
  expect(() => adapter().setAll!([{ name: "session", value: "dummy", options: {} }], {})).toThrow(
    "write failed",
  );
});
it("creates independent clients for separate requests", async () => {
  await createSupabaseServerClient();
  await createSupabaseServerClient();
  expect(createServerClient).toHaveBeenCalledTimes(2);
});
