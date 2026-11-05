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
const refreshTokens = new Set();
let refreshed = 0;
let sequence = 0;

function session(lifetime = 3600) {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      sub: user.id,
      email: user.email,
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
  tokens.set(token, now + lifetime);
  refreshTokens.add(refresh);
  return {
    access_token: token,
    refresh_token: refresh,
    token_type: "bearer",
    expires_in: lifetime,
    expires_at: now + lifetime,
    user,
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
  if (url.pathname === "/auth/v1/token") {
    if (url.searchParams.get("grant_type") === "refresh_token") {
      if (!refreshTokens.delete(body.refresh_token))
        return send(400, { code: "refresh_token_not_found", message: "Invalid fixture refresh" });
      refreshed++;
      return send(200, session());
    }
    if (body.email === user.email && body.password === "dummy-password")
      return send(200, session());
    return send(400, { code: "invalid_credentials", message: "Fixture credentials rejected" });
  }
  if (url.pathname === "/auth/v1/user") {
    const expiry = tokens.get(token);
    return expiry && expiry > Math.floor(Date.now() / 1000)
      ? send(200, user)
      : send(401, { code: "bad_jwt", message: "Fixture token rejected" });
  }
  if (url.pathname === "/auth/v1/logout") {
    tokens.delete(token);
    refreshTokens.clear();
    return send(200, {});
  }
  if (url.pathname === "/auth/v1/signup") return send(200, { ...user, email: body.email });
  return send(404, { message: "Unsupported fixture endpoint" });
}).listen(54329, "127.0.0.1");
