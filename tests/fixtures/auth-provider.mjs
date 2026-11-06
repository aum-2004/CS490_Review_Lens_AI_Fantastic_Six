// Local test double only. Never deploy or use as an authentication implementation.
import { createServer } from "node:http";
import { createHmac } from "node:crypto";

const user = {
  id: "00000000-0000-4000-8000-000000000009",
  email: "fixture@example.com",
  aud: "authenticated",
  role: "authenticated",
  app_metadata: { provider: "email", providers: ["email"] },
  user_metadata: {},
  identities: [],
  created_at: "2026-01-01T00:00:00Z",
};
const tokens = new Map();
const refreshTokens = new Map();
const users = [
  user,
  { ...user, id: "00000000-0000-4000-8000-000000000010", email: "fixture-b@example.com" },
  { ...user, id: "00000000-0000-4000-8000-000000000011", email: "empty-fixture@example.com" },
  { ...user, id: "00000000-0000-4000-8000-000000000012", email: "unavailable-fixture@example.com" },
];
const targetRows = [
  {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
    owner_id: user.id,
    name: "A coffee shop",
    platform: "google_maps",
    source_url: "https://www.google.com/maps/place/A+Coffee",
    created_at: "2026-11-01T12:00:00Z",
  },
  {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
    owner_id: user.id,
    name: "A bookstore",
    platform: "google_maps",
    source_url: "https://www.google.com/maps/place/A+Books",
    created_at: "2026-11-02T12:00:00Z",
  },
  {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3",
    owner_id: user.id,
    name: "A bakery",
    platform: "google_maps",
    source_url: "https://www.google.com/maps/place/A+Bakery",
    created_at: "2026-11-03T12:00:00Z",
  },
  {
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1",
    owner_id: users[1].id,
    name: "B restaurant",
    platform: "google_maps",
    source_url: "https://www.google.com/maps/place/B+Restaurant",
    created_at: "2026-11-02T12:00:00Z",
  },
];
let refreshed = 0;
let sequence = 0;
let failNextLogout = false;

function session(lifetime = 3600, sessionUser = user) {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      sub: sessionUser.id,
      email: sessionUser.email,
      aud: "authenticated",
      role: "authenticated",
      iat: now,
      exp: now + lifetime,
      jti: String(++sequence),
    }),
  ).toString("base64url");
  const signature = createHmac("sha256", "dummy-test-signing-secret")
    .update(`${header}.${payload}`)
    .digest("base64url");
  const token = `${header}.${payload}.${signature}`;
  const refresh = `dummy-refresh-${sequence}`;
  tokens.set(token, { expiry: now + lifetime, user: sessionUser });
  refreshTokens.set(refresh, sessionUser);
  return {
    access_token: token,
    refresh_token: refresh,
    token_type: "bearer",
    expires_in: lifetime,
    expires_at: now + lifetime,
    user: sessionUser,
  };
}

createServer(async (request, response) => {
  const url = new URL(request.url, "http://127.0.0.1:54329");
  response.setHeader("Content-Type", "application/json");
  response.setHeader("Cache-Control", "no-store");
  const send = (status, body) => {
    response.writeHead(status);
    response.end(JSON.stringify(body));
  };
  if (url.pathname === "/ready") return send(200, { ready: true });
  if (url.pathname === "/stats") return send(200, { refreshed });
  if (url.pathname === "/fail-next-logout") {
    failNextLogout = true;
    return send(200, { ready: true });
  }
  // Explicit test control: inject an expired session after login to exercise Proxy.
  if (url.pathname === "/expired-session") return send(200, session(-60));

  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  let body;
  try {
    body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {};
  } catch {
    return send(400, { code: "bad_json", message: "Invalid test request" });
  }

  const token = (request.headers.authorization || "").replace(/^Bearer /i, "");
  if (url.pathname === "/rest/v1/analysis_targets" && request.method === "GET") {
    const identity = tokens.get(token);
    if (!identity || identity.expiry <= Math.floor(Date.now() / 1000)) {
      return send(401, { message: "Fixture database requires identity" });
    }
    // Assert application-level scoping as well as simulating database RLS.
    if (url.searchParams.get("owner_id") !== "eq." + identity.user.id) {
      return send(400, { message: "Fixture requires owner-scoped query" });
    }
    if (identity.user.email === "unavailable-fixture@example.com") {
      return send(500, { message: "private fixture database failure" });
    }
    const rows = targetRows
      .filter((row) => row.owner_id === identity.user.id)
      .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id));
    const offset = Number(url.searchParams.get("offset") ?? 0);
    // Deliberately below the app page size to verify it does not stop too early.
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 2), 2);
    return send(200, rows.slice(offset, offset + limit));
  }
  if (url.pathname === "/auth/v1/token") {
    if (url.searchParams.get("grant_type") === "refresh_token") {
      const sessionUser = refreshTokens.get(body.refresh_token);
      if (!sessionUser)
        return send(400, { code: "refresh_token_not_found", message: "Invalid fixture refresh" });
      refreshTokens.delete(body.refresh_token);
      refreshed++;
      return send(200, session(3600, sessionUser));
    }
    const sessionUser = users.find((candidate) => candidate.email === body.email);
    if (sessionUser && body.password === "dummy-password")
      return send(200, session(3600, sessionUser));
    return send(400, { code: "invalid_credentials", message: "Fixture credentials rejected" });
  }
  if (url.pathname === "/auth/v1/user") {
    const identity = tokens.get(token);
    return identity && identity.expiry > Math.floor(Date.now() / 1000)
      ? send(200, identity.user)
      : send(401, { code: "bad_jwt", message: "Fixture token rejected" });
  }
  if (url.pathname === "/auth/v1/logout") {
    if (failNextLogout) {
      failNextLogout = false;
      return send(500, { message: "private fixture logout failure" });
    }
    const identity = tokens.get(token);
    tokens.delete(token);
    for (const [refresh, sessionUser] of refreshTokens) {
      if (sessionUser.id === identity?.user.id) refreshTokens.delete(refresh);
    }
    return send(200, {});
  }
  if (url.pathname === "/auth/v1/signup") return send(200, { ...user, email: body.email });
  return send(404, { message: "Unsupported fixture endpoint" });
}).listen(54329, "127.0.0.1");
