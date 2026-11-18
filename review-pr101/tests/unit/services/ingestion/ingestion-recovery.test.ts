/** @jest-environment node */
import {
  ingestionRecoveryConfigured,
  ingestionRecoveryUrl,
  validRecoverySignature,
  recoverIngestionBinding,
} from "@/services/ingestion/ingestion-recovery";
const attemptId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const originalOrigin = process.env.INGESTION_CALLBACK_ORIGIN;
const originalSecret = process.env.INGESTION_CALLBACK_SECRET;
beforeEach(() => {
  process.env.INGESTION_CALLBACK_ORIGIN = "https://app.example.com";
  process.env.INGESTION_CALLBACK_SECRET = "synthetic-test-secret-that-is-not-a-real-key";
});
afterAll(() => {
  if (originalOrigin === undefined) delete process.env.INGESTION_CALLBACK_ORIGIN;
  else process.env.INGESTION_CALLBACK_ORIGIN = originalOrigin;
  if (originalSecret === undefined) delete process.env.INGESTION_CALLBACK_SECRET;
  else process.env.INGESTION_CALLBACK_SECRET = originalSecret;
});
it("creates a per-attempt capability without exposing the signing secret", () => {
  const url = new URL(ingestionRecoveryUrl(attemptId));
  expect(url.origin).toBe("https://app.example.com");
  expect(url.pathname).toBe(`/api/ingestion/provider-callback/${attemptId}`);
  expect(validRecoverySignature(attemptId, url.searchParams.get("signature"))).toBe(true);
  expect(url.href).not.toContain(process.env.INGESTION_CALLBACK_SECRET);
  expect(
    validRecoverySignature(
      "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      url.searchParams.get("signature"),
    ),
  ).toBe(false);
});
it.each([
  "http://app.example.com",
  "https://app.example.com/path",
  "https://name:password@app.example.com",
  "https://app.example.com?token=bad",
])("rejects an unsafe/noncanonical origin %s", (origin) => {
  process.env.INGESTION_CALLBACK_ORIGIN = origin;
  expect(ingestionRecoveryConfigured()).toBe(false);
});
it("does not accept missing or malformed signatures", () => {
  for (const token of [null, "", "x".repeat(64), "a".repeat(64)])
    expect(validRecoverySignature(attemptId, token)).toBe(false);
});
it("requires an adequately sized configured secret", () => {
  process.env.INGESTION_CALLBACK_SECRET = "short";
  expect(ingestionRecoveryConfigured()).toBe(false);
  expect(() => ingestionRecoveryUrl(attemptId)).toThrow("not configured");
});
it("recovers using only the owner of the stored attempt", async () => {
  const writer = {
    findForRecovery: jest.fn().mockResolvedValue({ id: attemptId, owner_id: "stored-owner" }),
    bind: jest.fn(),
  };
  expect(await recoverIngestionBinding(attemptId, "provider-job", writer as never)).toBe(true);
  expect(writer.bind).toHaveBeenCalledWith(attemptId, "stored-owner", "provider-job");
});
