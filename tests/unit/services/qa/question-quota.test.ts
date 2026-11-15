/** @jest-environment node */
import { reserveQuestionQuota } from "@/services/qa/question-quota";

jest.mock("server-only", () => ({}));
const rpc = jest.fn();
const client = { rpc } as unknown as Parameters<typeof reserveQuestionQuota>[0];
beforeEach(() => rpc.mockReset());

it.each([0, 1, 4])("accepts a durable reservation with %i slots left", async (data) => {
  rpc.mockResolvedValue({ data, error: null });
  await expect(reserveQuestionQuota(client)).resolves.toBeUndefined();
  expect(rpc).toHaveBeenCalledWith("reserve_review_question");
});

it("maps only the exact database limit error to a user-safe quota error", async () => {
  rpc.mockResolvedValue({ data: null, error: { code: "P0001", message: "QA_DAILY_LIMIT" } });
  await expect(reserveQuestionQuota(client)).rejects.toMatchObject({ code: "QA_DAILY_LIMIT" });
});

it.each([null, undefined, "4", -1, 5, 1.5, {}, false])(
  "fails closed on invalid reservation result (%#. case)",
  async (data) => {
    rpc.mockResolvedValue({ data, error: null });
    await expect(reserveQuestionQuota(client)).rejects.toMatchObject({
      code: "QA_QUOTA_UNAVAILABLE",
    });
  },
);

it.each(["42501", "PGRST202", "P0001"])(
  "does not expose database diagnostics for %s",
  async (code) => {
    rpc.mockResolvedValue({ data: null, error: { code, message: "PRIVATE_DATABASE_DIAGNOSTIC" } });
    await expect(reserveQuestionQuota(client)).rejects.toMatchObject({
      code: "QA_QUOTA_UNAVAILABLE",
      message: "Question limits are temporarily unavailable. Please try again later.",
    });
  },
);

it("fails closed if the RPC transport throws", async () => {
  rpc.mockRejectedValue(new Error("PRIVATE_TRANSPORT_DIAGNOSTIC"));
  await expect(reserveQuestionQuota(client)).rejects.toMatchObject({
    code: "QA_QUOTA_UNAVAILABLE",
  });
});
