/** @jest-environment node */
import { unstable_doesMiddlewareMatch as doesProxyMatch } from "next/experimental/testing/server";
import { config } from "@/proxy";

// Exercise Next's actual matcher interpretation, not just our path predicates.
// Next 16.4.3 exports the legacy Middleware name despite its bundled guide
// naming doesProxyMatch. Use the installed implementation without upgrading it.
// This catches missing namespace roots and nested ingestion/review paths before
// a future route reaches a read-only server client without session refresh.
it.each([
  "/login",
  "/auth/confirm",
  "/api/auth/session",
  "/analysis-targets",
  "/analysis-targets/new",
  "/analysis-targets/target-a?tab=reviews",
  "/api/analysis-targets",
  "/api/analysis-targets/target-a",
  "/api/analysis-targets/target-a/ingestion",
  "/api/analysis-targets/target-a/reviews",
])("refreshes sessions for %s", (url) => {
  expect(doesProxyMatch({ config, nextConfig: {}, url })).toBe(true);
});

it.each(["/", "/api/health", "/favicon.ico", "/_next/static/app.js", "/analysis-targets-other"])(
  "keeps unrelated public/static path %s outside the auth matcher",
  (url) => {
    expect(doesProxyMatch({ config, nextConfig: {}, url })).toBe(false);
  },
);
