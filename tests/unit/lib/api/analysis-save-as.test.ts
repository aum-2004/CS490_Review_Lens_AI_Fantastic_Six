/** @jest-environment node */

// S3-003: the browser client sends only the new name and validates the copy it gets back.
import { AnalysisSaveAsError, saveAnalysisAs } from "@/lib/api/analysis-targets";

const copy = {
  id: "copy-1",
  name: "Weekend copy",
  sourceUrl: "https://maps.google.com/?cid=1",
  platform: "google_maps",
};
const fetchMock = jest.fn();
beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock;
});

test("posts only the name as JSON to the encoded Save As URL", async () => {
  fetchMock.mockResolvedValue(Response.json({ success: true, data: copy }, { status: 201 }));
  await expect(saveAnalysisAs("target 1", "Weekend copy")).resolves.toEqual(copy);
  expect(fetchMock).toHaveBeenCalledWith("/api/analysis-targets/target%201/save-as", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: '{"name":"Weekend copy"}',
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
  [404, {}, "TARGET_NOT_FOUND"],
  [
    409,
    { success: false, error: { code: "ANALYSIS_LIMIT", message: "Limit reached." } },
    "ANALYSIS_LIMIT",
  ],
  [409, { success: false, error: { code: "OTHER", message: "x" } }, "SAVE_AS_FAILED"],
  [500, { success: false, error: { code: "SAVE_AS_FAILED" } }, "SAVE_AS_FAILED"],
  [200, { success: true, data: copy }, "SAVE_AS_FAILED"],
  [201, { success: true, data: { ...copy, id: "target-1" } }, "SAVE_AS_FAILED"],
  [201, { success: true, data: {} }, "SAVE_AS_FAILED"],
])("maps HTTP %s to %s", async (status, body, code) => {
  fetchMock.mockResolvedValue(Response.json(body, { status }));
  await expect(saveAnalysisAs("target-1", "Copy")).rejects.toMatchObject({ code });
});

test("keeps the server's limit message and validation issues", async () => {
  fetchMock.mockResolvedValueOnce(
    Response.json(
      { success: false, error: { code: "ANALYSIS_LIMIT", message: "Limit reached." } },
      { status: 409 },
    ),
  );
  await expect(saveAnalysisAs("target-1", "Copy")).rejects.toMatchObject({
    message: "Limit reached.",
  });
  fetchMock.mockResolvedValueOnce(
    Response.json(
      {
        success: false,
        error: { issues: [{ field: "name", code: "TARGET_NAME_REQUIRED", message: "Required" }] },
      },
      { status: 400 },
    ),
  );
  const error = await saveAnalysisAs("target-1", "Copy").catch((cause: unknown) => cause);
  expect(error).toBeInstanceOf(AnalysisSaveAsError);
  expect((error as AnalysisSaveAsError).issues).toEqual([
    { field: "name", code: "TARGET_NAME_REQUIRED", message: "Required" },
  ]);
});

test("reports an unreachable server and a non-JSON body", async () => {
  fetchMock.mockRejectedValueOnce(new TypeError("offline"));
  await expect(saveAnalysisAs("target-1", "Copy")).rejects.toMatchObject({
    code: "SAVE_AS_UNAVAILABLE",
  });
  fetchMock.mockResolvedValueOnce(new Response("<html>", { status: 201 }));
  await expect(saveAnalysisAs("target-1", "Copy")).rejects.toMatchObject({
    code: "SAVE_AS_FAILED",
  });
});
