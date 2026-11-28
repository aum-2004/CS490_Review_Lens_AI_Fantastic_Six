/** @jest-environment node */

// S3-003: the Save As service calls the ownership-checking RPC and maps every failure safely.
import type { SupabaseClient } from "@supabase/supabase-js";
import { SaveAnalysisAsError, saveAnalysisAs } from "@/services/analysis-targets/save-analysis-as";
import { TargetNotFoundError } from "@/services/analysis-targets/target-ownership";

jest.mock("server-only", () => ({}));

const SOURCE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const COPY = "cccccccc-cccc-4ccc-8ccc-ccccccccccc1";

function client(result: unknown, reject = false) {
  const rpc = reject
    ? jest.fn().mockRejectedValue(new Error("socket"))
    : jest.fn().mockResolvedValue(result);
  return { client: { rpc } as unknown as SupabaseClient, rpc };
}

it("sends the source and name to the RPC and returns the new id", async () => {
  const { client: session, rpc } = client({ data: COPY, error: null });
  await expect(saveAnalysisAs(session, SOURCE, "Weekend copy")).resolves.toBe(COPY);
  expect(rpc).toHaveBeenCalledWith("save_analysis_as", {
    p_source_target_id: SOURCE,
    p_name: "Weekend copy",
  });
});

it("maps a missing or foreign source to TargetNotFoundError", async () => {
  const { client: session } = client({ data: null, error: { code: "P0002", message: "x" } });
  await expect(saveAnalysisAs(session, SOURCE, "Copy")).rejects.toBeInstanceOf(TargetNotFoundError);
});

it("reports the analysis limit separately", async () => {
  const { client: session } = client({
    data: null,
    error: { code: "P0001", message: "ANALYSIS_LIMIT" },
  });
  await expect(saveAnalysisAs(session, SOURCE, "Copy")).rejects.toMatchObject({
    code: "ANALYSIS_LIMIT",
  });
});

it.each([
  ["a name rejected by the database", { data: null, error: { code: "23514", message: "name" } }],
  ["another raised error", { data: null, error: { code: "P0001", message: "OTHER" } }],
  ["a non-uuid result", { data: "not-a-uuid", error: null }],
  ["an empty result", { data: null, error: null }],
])("fails closed on %s", async (_case, result) => {
  const { client: session } = client(result);
  const error = await saveAnalysisAs(session, SOURCE, "Copy").catch((cause: unknown) => cause);
  expect(error).toBeInstanceOf(SaveAnalysisAsError);
  expect(error).toMatchObject({ code: "SAVE_AS_FAILED" });
});

it("fails closed when the request throws", async () => {
  const { client: session } = client(undefined, true);
  await expect(saveAnalysisAs(session, SOURCE, "Copy")).rejects.toMatchObject({
    code: "SAVE_AS_FAILED",
  });
});
