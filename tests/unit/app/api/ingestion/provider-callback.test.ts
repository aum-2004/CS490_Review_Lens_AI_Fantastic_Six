/** @jest-environment node */
import { NextRequest } from "next/server";
import { createHmac } from "node:crypto";
import { POST } from "@/app/api/ingestion/provider-callback/[attemptId]/route";
import { ingestionRecoveryUrl } from "@/services/ingestion/ingestion-recovery";
import { createIngestionAdminClient } from "@/lib/supabase/ingestion-admin";
jest.mock("@/lib/supabase/ingestion-admin", () => ({ createIngestionAdminClient: jest.fn() }));
const attemptId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const attempt = {
  id: attemptId,
  owner_id: "stored-owner",
  analysis_target_id: "stored-target",
  status: "processing",
};
const rpc = jest.fn();
const maybeSingle = jest.fn();
const from = jest.fn(() => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }));
beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, "error").mockImplementation(() => {});
  jest.spyOn(console, "warn").mockImplementation(() => {});
  jest.spyOn(console, "info").mockImplementation(() => {});
  process.env.INGESTION_CALLBACK_ORIGIN = "https://app.example.com";
  process.env.INGESTION_CALLBACK_SECRET = "synthetic-test-secret-that-is-not-a-real-key";
  process.env.OUTSCRAPER_API_KEY = "synthetic-provider-api-key";
  maybeSingle.mockResolvedValue({ data: attempt, error: null });
  rpc.mockResolvedValue({ data: attempt, error: null });
  jest.mocked(createIngestionAdminClient).mockReturnValue({ from, rpc } as never);
});
afterEach(() => jest.restoreAllMocks());
const context = { params: Promise.resolve({ attemptId }) };
function callback(url: string, body: string) {
  const signature =
    "sha256=" + createHmac("sha256", "synthetic-provider-api-key").update(body).digest("hex");
  return POST(
    new NextRequest(url, { method: "POST", body, headers: { "x-hub-signature-256": signature } }),
    context as never,
  );
}
it("rejects a leaked correlation URL without a valid provider body signature", async () => {
  const response = await POST(
    new NextRequest(ingestionRecoveryUrl(attemptId), {
      method: "POST",
      body: '{"id":"stolen-job"}',
    }),
    context as never,
  );
  expect(response.status).toBe(404);
  expect(createIngestionAdminClient).not.toHaveBeenCalled();
});
it("rejects tampering after the provider signed the body", async () => {
  const signature =
    "sha256=" +
    createHmac("sha256", "synthetic-provider-api-key")
      .update('{"id":"original-job"}')
      .digest("hex");
  const response = await POST(
    new NextRequest(ingestionRecoveryUrl(attemptId), {
      method: "POST",
      body: '{"id":"swapped-job"}',
      headers: { "x-hub-signature-256": signature },
    }),
    context as never,
  );
  expect(response.status).toBe(404);
  expect(createIngestionAdminClient).not.toHaveBeenCalled();
});
it("rejects browser job IDs without the server capability before database access", async () => {
  const response = await callback(
    `https://app.example.com/api/ingestion/provider-callback/${attemptId}`,
    '{"id":"stolen-job"}',
  );
  expect(response.status).toBe(404);
  expect(createIngestionAdminClient).not.toHaveBeenCalled();
});
it("binds valid metadata to the stored owner, ignoring source, owner and results URL fields", async () => {
  const response = await callback(
    ingestionRecoveryUrl(attemptId),
    JSON.stringify({
      id: "synthetic-job",
      ownerId: "forged-owner",
      status: "Success",
      sourceUrl: "https://evil.example",
      results_location: "https://evil.example/results",
      reviews: [{ text: "fabricated" }],
    }),
  );
  expect(response.status).toBe(200);
  expect(rpc).toHaveBeenCalledWith("bind_ingestion_job", {
    p_attempt_id: attemptId,
    p_owner_id: "stored-owner",
    p_request_id: "synthetic-job",
  });
  expect(rpc).toHaveBeenCalledTimes(1);
  expect(await response.json()).toEqual({ success: true, data: { received: true } });
});
it("gives unknown attempts the same safe unavailable response", async () => {
  maybeSingle.mockResolvedValue({ data: null, error: null });
  expect((await callback(ingestionRecoveryUrl(attemptId), '{"id":"synthetic-job"}')).status).toBe(
    404,
  );
  expect(rpc).not.toHaveBeenCalled();
});
it.each(["invalid JSON", '{"id":"../stolen"}', "{}"])(
  "rejects malformed metadata %s",
  async (body) => {
    expect((await callback(ingestionRecoveryUrl(attemptId), body)).status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  },
);
it("bounds callback bodies before privileged storage access", async () => {
  expect(
    (
      await callback(
        ingestionRecoveryUrl(attemptId),
        JSON.stringify({ id: "job", data: "x".repeat(9000) }),
      )
    ).status,
  ).toBe(413);
  expect(createIngestionAdminClient).not.toHaveBeenCalled();
});
it("returns a safe retry response when binding storage is unavailable", async () => {
  rpc.mockResolvedValue({ data: null, error: { message: "private secret diagnostic" } });
  const response = await callback(ingestionRecoveryUrl(attemptId), '{"id":"synthetic-job"}');
  expect(response.status).toBe(503);
  expect(JSON.stringify(await response.json())).not.toContain("secret");
  expect(JSON.stringify(jest.mocked(console.error).mock.calls)).not.toContain("secret");
});
