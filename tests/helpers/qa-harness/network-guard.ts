import http from "node:http";
import https from "node:https";
import net from "node:net";

/**
 * S2-003 network guard. While installed:
 *
 * - `globalThis.fetch`, `http(s).request/get`, and `net.Socket#connect` throw `RealNetworkCallError`.
 *   Every TCP client in Node (including undici/fetch and supabase-js) ends in one of these.
 * - Provider and Supabase environment variables are removed, so a real OpenAI client fails closed
 *   (`QA_DISABLED`) even before reaching the network.
 *
 * Every blocked attempt is recorded. `assertNoAttempts()` (called by the harness `cleanup`) fails
 * the test even if the code under test caught and swallowed the error.
 */

export class RealNetworkCallError extends Error {
  constructor(readonly target: string) {
    super(
      `Blocked real network access to ${target}. Q&A tests must use the S2-003 fake model; ` +
        (/openai/i.test(target)
          ? "this looks like a real OpenAI call."
          : "no live service may be reached from the deterministic suite."),
    );
    this.name = "RealNetworkCallError";
  }
}

/** Removed while the guard is installed; restored afterwards. */
export const SCRUBBED_ENV_PATTERN =
  /^(OPENAI_|QA_ENABLED$|NEXT_PUBLIC_SUPABASE_|SUPABASE_|OUTSCRAPER_|INGESTION_)/;

export interface NetworkGuard {
  /** Targets of every blocked attempt, in order. */
  readonly attempts: readonly string[];
  assertNoAttempts(): void;
  clearAttempts(): void;
  restore(): void;
}

function describeTarget(value: unknown): string {
  // `net.connect()` hands Socket#connect its normalised arguments as `[options, callback]`.
  if (Array.isArray(value)) return describeTarget(value[0]);
  if (typeof value === "string") return value;
  if (value instanceof URL) return value.href;
  if (typeof value === "object" && value !== null) {
    if ("url" in value && typeof value.url === "string") return value.url;
    const host = "host" in value ? value.host : "hostname" in value ? value.hostname : undefined;
    const port = "port" in value ? value.port : undefined;
    if (host !== undefined || port !== undefined) return `${String(host)}:${String(port)}`;
    if ("path" in value && typeof value.path === "string") return value.path;
  }
  if (typeof value === "number") return `port ${value}`;
  return "unknown target";
}

let active: NetworkGuard | undefined;

export function installNetworkGuard(): NetworkGuard {
  if (active) {
    throw new Error("A network guard is already installed. Call restore() on it first.");
  }

  const attempts: string[] = [];
  const block = (target: string): never => {
    attempts.push(target);
    throw new RealNetworkCallError(target);
  };

  const originals = {
    fetch: globalThis.fetch,
    httpRequest: http.request,
    httpGet: http.get,
    httpsRequest: https.request,
    httpsGet: https.get,
    socketConnect: net.Socket.prototype.connect,
  };
  const savedEnv = new Map<string, string>();
  for (const [key, value] of Object.entries(process.env)) {
    if (SCRUBBED_ENV_PATTERN.test(key) && value !== undefined) {
      savedEnv.set(key, value);
      delete process.env[key];
    }
  }

  globalThis.fetch = (async (input: Parameters<typeof fetch>[0]) =>
    block(describeTarget(input))) as typeof fetch;
  // The Node signatures are heavily overloaded; each replacement only needs the first argument.
  http.request = ((target: unknown) => block(describeTarget(target))) as typeof http.request;
  http.get = ((target: unknown) => block(describeTarget(target))) as typeof http.get;
  https.request = ((target: unknown) => block(describeTarget(target))) as typeof https.request;
  https.get = ((target: unknown) => block(describeTarget(target))) as typeof https.get;
  net.Socket.prototype.connect = function blockedConnect(target: unknown) {
    return block(describeTarget(target));
  } as typeof net.Socket.prototype.connect;

  const guard: NetworkGuard = {
    attempts,
    assertNoAttempts() {
      if (attempts.length > 0) {
        throw new RealNetworkCallError(attempts.join(", "));
      }
    },
    clearAttempts() {
      attempts.length = 0;
    },
    restore() {
      if (active !== guard) return;
      globalThis.fetch = originals.fetch;
      http.request = originals.httpRequest;
      http.get = originals.httpGet;
      https.request = originals.httpsRequest;
      https.get = originals.httpsGet;
      net.Socket.prototype.connect = originals.socketConnect;
      // Drop anything a test set while guarded, then put back the original values.
      for (const key of Object.keys(process.env)) {
        if (SCRUBBED_ENV_PATTERN.test(key)) delete process.env[key];
      }
      for (const [key, value] of savedEnv) process.env[key] = value;
      active = undefined;
    },
  };
  active = guard;
  return guard;
}
