/** @jest-environment node */
import { renameAnalysisTarget } from "@/lib/api/analysis-targets";

const target = {
  id: "target-1",
  name: "New",
  sourceUrl: "https://maps.google.com/?cid=1",
  platform: "google_maps",
};
const fetchMock = jest.fn();
beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock;
});

test("sends only name as JSON to the encoded target URL", async () => {
  fetchMock.mockResolvedValue(Response.json({ success: true, data: target }));
  await expect(renameAnalysisTarget("target-1", "New")).resolves.toEqual(target);
  expect(fetchMock).toHaveBeenCalledWith("/api/analysis-targets/target-1", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: '{"name":"New"}',
    signal: undefined,
  });
});
test.each([
  [401, {}, "AUTHENTICATION_REQUIRED"],
  [
    400,
    {
      success: false,
      error: { issues: [{ field: "name", code: "TARGET_NAME_REQUIRED", message: "Required" }] },
    },
    "INVALID_ANALYSIS_TARGET_INPUT",
  ],
  [400, { success: false, error: { issues: [{ field: "bad" }] } }, "INVALID_ANALYSIS_TARGET_INPUT"],
  [404, {}, "TARGET_NOT_FOUND"],
  [503, { error: "private" }, "RENAME_FAILED"],
  [200, { success: true, data: { ...target, id: "wrong-target" } }, "RENAME_FAILED"],
  [200, { success: true, data: {} }, "RENAME_FAILED"],
])("maps status %s to a safe error", async (status, payload, code) => {
  fetchMock.mockResolvedValue(Response.json(payload, { status: status as number }));
  await expect(renameAnalysisTarget("target-1", "New")).rejects.toMatchObject({ code });
});
test("encodes the ID and handles a network failure safely", async () => {
  fetchMock.mockRejectedValue(new Error("private network details"));
  await expect(renameAnalysisTarget("x/y", "New")).rejects.toMatchObject({
    code: "RENAME_UNAVAILABLE",
  });
  expect(fetchMock.mock.calls[0][0]).toBe("/api/analysis-targets/x%2Fy");
});
test("handles malformed JSON safely", async () => {
  fetchMock.mockResolvedValue(new Response("not json"));
  await expect(renameAnalysisTarget("target-1", "New")).rejects.toMatchObject({
    code: "RENAME_FAILED",
  });
});
