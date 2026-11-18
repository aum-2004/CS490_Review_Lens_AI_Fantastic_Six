import { askReviewQuestion } from "@/lib/api/review-questions";

const A1 = "a1a1a1a1-0000-4000-8000-000000000001";
const A2 = "a2a2a2a2-0000-4000-8000-000000000002";
const mockFetch = jest.fn();
const originalFetch = global.fetch;
beforeEach(() => {
  global.fetch = mockFetch;
  mockFetch.mockReset();
});
afterAll(() => {
  global.fetch = originalFetch;
});

const data = {
  targetId: "target-a",
  outcome: "answered",
  answer: `Customers praise the service [${A1}].`,
  citedReviewIds: [A1, A2],
};
function respond(payload: unknown) {
  mockFetch.mockResolvedValue({ status: 200, ok: true, json: async () => payload });
}
const ask = () => askReviewQuestion("target-a", "Question", new AbortController().signal);

it("returns well-formed citations unchanged and drops unknown fields", async () => {
  respond({ success: true, data: { ...data, extra: "PRIVATE_FIELD" } });
  await expect(ask()).resolves.toEqual(data);
});

it("parses the older response shape without citedReviewIds as having no citations", async () => {
  const legacy: Partial<typeof data> = { ...data };
  delete legacy.citedReviewIds;
  respond({ success: true, data: legacy });
  await expect(ask()).resolves.toEqual({ ...legacy, citedReviewIds: [] });
});

it.each([
  ["null", null],
  ["a string", A1],
  ["an object", { first: A1 }],
  ["a non-string item", [A1, 42]],
  ["a non-UUID item", ["review-1"]],
  ["duplicates", [A1, A1]],
  ["too many items", Array.from({ length: 101 }, (_, i) => A1.replace(/1$/, String(i)))],
])("fails closed on malformed citedReviewIds: %s", async (_label, citedReviewIds) => {
  respond({ success: true, data: { ...data, citedReviewIds } });
  await expect(ask()).rejects.toThrow("unexpected response");
});

it.each(["insufficient_evidence", "out_of_scope"])(
  "fails closed when a %s response carries citations and accepts it without",
  async (outcome) => {
    respond({ success: true, data: { ...data, outcome } });
    await expect(ask()).rejects.toThrow("unexpected response");
    respond({ success: true, data: { ...data, outcome, citedReviewIds: [] } });
    await expect(ask()).resolves.toMatchObject({ outcome, citedReviewIds: [] });
  },
);

it("still rejects a response for another target even with valid citations", async () => {
  respond({ success: true, data: { ...data, targetId: "target-b" } });
  await expect(ask()).rejects.toThrow("unexpected response");
});
