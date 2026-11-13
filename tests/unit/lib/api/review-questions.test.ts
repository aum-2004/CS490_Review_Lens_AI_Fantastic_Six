import { askReviewQuestion } from "@/lib/api/review-questions";

const mockFetch = jest.fn();
const originalFetch = global.fetch;
beforeEach(() => {
  global.fetch = mockFetch;
  mockFetch.mockReset();
});
afterAll(() => {
  global.fetch = originalFetch;
});
const data = { targetId: "target-a", outcome: "answered", answer: "Customers praise the service." };
const signal = () => new AbortController().signal;
function respond(status: number, payload: unknown) {
  mockFetch.mockResolvedValue({
    status,
    ok: status >= 200 && status < 300,
    json: async () => payload,
  });
}

it("posts only the question to the selected target without caching", async () => {
  respond(200, { success: true, data });
  const abortSignal = signal();
  await expect(
    askReviewQuestion("target-a", "What do customers like?", abortSignal),
  ).resolves.toEqual(data);
  expect(mockFetch).toHaveBeenCalledWith("/api/analysis-targets/target-a/questions", {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question: "What do customers like?" }),
    signal: abortSignal,
  });
});

it.each([
  [401, "AUTHENTICATION_REQUIRED"],
  [403, "UNAVAILABLE"],
  [404, "UNAVAILABLE"],
  [429, "FAILED"],
  [500, "FAILED"],
  [503, "FAILED"],
])("safely handles status %s", async (status, code) => {
  respond(status, { error: "private diagnostic" });
  await expect(askReviewQuestion("target-a", "Question", signal())).rejects.toMatchObject({ code });
});

it.each([
  null,
  {},
  { success: false, data },
  { success: true, data: { ...data, targetId: "previous-target" } },
  { success: true, data: { ...data, outcome: "unknown" } },
  { success: true, data: { ...data, answer: " " } },
  { success: true, data: { ...data, answer: 42 } },
])("rejects malformed or wrong-target responses (%#. case)", async (payload) => {
  respond(200, payload);
  await expect(askReviewQuestion("target-a", "Question", signal())).rejects.toThrow(
    "unexpected response",
  );
});

it("handles unreadable response bodies", async () => {
  mockFetch.mockResolvedValue({
    status: 200,
    ok: true,
    json: async () => {
      throw new Error("secret");
    },
  });
  await expect(askReviewQuestion("target-a", "Question", signal())).rejects.toThrow(
    "unexpected response",
  );
});

it("handles network failures without leaking diagnostics", async () => {
  mockFetch.mockRejectedValue(new Error("secret"));
  await expect(askReviewQuestion("target-a", "Question", signal())).rejects.toThrow(
    "Check your connection",
  );
});

it("gives an actionable timeout message", async () => {
  const controller = new AbortController();
  controller.abort();
  mockFetch.mockRejectedValue(new Error("secret"));
  await expect(askReviewQuestion("target-a", "Question", controller.signal)).rejects.toThrow(
    "took too long",
  );
});

it.each(["insufficient_evidence", "out_of_scope"])("accepts the %s outcome", async (outcome) => {
  respond(200, { success: true, data: { ...data, outcome } });
  await expect(askReviewQuestion("target-a", "Question", signal())).resolves.toMatchObject({
    outcome,
  });
});

it.each([
  ["NO_REVIEW_DATA", "Complete ingestion first"],
  ["REVIEW_CONTEXT_TOO_LARGE", "exceed the supported Q&A size"],
  ["REVIEW_CONTEXT_UNAVAILABLE", "couldn't load the saved reviews"],
  ["REQUEST_TOO_LARGE", "Try a shorter question"],
  ["QA_DISABLED", "temporarily unavailable"],
  ["MODEL_TIMEOUT", "took too long"],
  ["MODEL_RATE_LIMITED", "Too many questions"],
])("translates %s to actionable local copy", async (code, message) => {
  respond(422, { error: { code, message: "PRIVATE_DIAGNOSTIC" } });
  await expect(askReviewQuestion("target-a", "Question", signal())).rejects.toThrow(message);
});

it("ignores unrecognized error codes and arbitrary server copy", async () => {
  respond(503, { error: { code: "constructor", message: "PRIVATE_DIAGNOSTIC" } });
  await expect(askReviewQuestion("target-a", "Question", signal())).rejects.toThrow(
    "Please try again later",
  );
});
