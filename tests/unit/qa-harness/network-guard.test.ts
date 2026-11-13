/** @jest-environment node */

import http from "node:http";
import https from "node:https";
import net from "node:net";

import { installNetworkGuard, RealNetworkCallError } from "../../helpers/qa-harness";

describe("installNetworkGuard", () => {
  const savedEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...savedEnv };
  });

  it("blocks fetch, http, https and raw sockets, and records every attempt", async () => {
    const guard = installNetworkGuard();
    try {
      await expect(fetch("https://api.openai.com/v1/responses")).rejects.toThrow(
        /real OpenAI call/,
      );
      expect(() => http.get("http://example.test/")).toThrow(RealNetworkCallError);
      expect(() => https.request({ host: "db.supabase.co", port: 443 })).toThrow(
        RealNetworkCallError,
      );
      expect(() => net.connect({ host: "127.0.0.1", port: 5432 })).toThrow(RealNetworkCallError);

      expect(guard.attempts).toEqual([
        "https://api.openai.com/v1/responses",
        "http://example.test/",
        "db.supabase.co:443",
        "127.0.0.1:5432",
      ]);
    } finally {
      guard.restore();
    }
  });

  it("still fails the test when the code under test swallows the error", async () => {
    const guard = installNetworkGuard();
    try {
      await fetch("https://api.openai.com/v1/responses").catch(() => undefined);
      expect(() => guard.assertNoAttempts()).toThrow(RealNetworkCallError);
      guard.clearAttempts();
      expect(() => guard.assertNoAttempts()).not.toThrow();
    } finally {
      guard.restore();
    }
  });

  it("removes provider and Supabase variables while installed, then restores them", () => {
    process.env.OPENAI_API_KEY = "synthetic-not-a-key";
    process.env.QA_ENABLED = "true";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://synthetic.test";
    process.env.UNRELATED_SETTING = "kept";

    const guard = installNetworkGuard();
    expect(process.env.OPENAI_API_KEY).toBeUndefined();
    expect(process.env.QA_ENABLED).toBeUndefined();
    expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBeUndefined();
    expect(process.env.UNRELATED_SETTING).toBe("kept");

    process.env.OPENAI_QA_MODEL = "set-during-test";
    guard.restore();

    expect(process.env.OPENAI_API_KEY).toBe("synthetic-not-a-key");
    expect(process.env.QA_ENABLED).toBe("true");
    expect(process.env.OPENAI_QA_MODEL).toBeUndefined();
  });

  it("restores the original network functions", () => {
    const originals = [globalThis.fetch, http.request, https.get, net.Socket.prototype.connect];
    installNetworkGuard().restore();
    expect([globalThis.fetch, http.request, https.get, net.Socket.prototype.connect]).toEqual(
      originals,
    );
  });

  it("refuses to install twice and ignores a second restore", () => {
    const guard = installNetworkGuard();
    try {
      expect(() => installNetworkGuard()).toThrow("already installed");
    } finally {
      guard.restore();
      guard.restore();
    }
    installNetworkGuard().restore();
  });
});
