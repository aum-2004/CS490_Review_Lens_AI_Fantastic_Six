/** @jest-environment node */
import {
  getTargetIngestionSummaries,
  IngestionPersistenceError,
} from "@/services/ingestion/ingestion-attempt-repository";
function database(data: unknown, error: unknown = null) {
  const calls: unknown[][] = [];
  const query = {
    select: (value: string) => {
      calls.push(["select", value]);
      return query;
    },
    eq: (field: string, value: string) => {
      calls.push(["eq", field, value]);
      return query;
    },
    in: (field: string, value: string[]) => {
      calls.push(["in", field, value]);
      return query;
    },
    limit: async (value: number) => {
      calls.push(["limit", value]);
      return { data, error };
    },
  };
  return {
    calls,
    client: {
      from: (table: string) => {
        calls.push(["from", table]);
        return query;
      },
    } as never,
  };
}
const row = {
  analysis_target_id: "target-a",
  owner_id: "user-a",
  state: "not_ingested",
  started_at: null,
  finished_at: null,
  saved_count: 0,
  skipped_count: 0,
  error_code: null,
};
it("uses explicit owner, target filters and backend no-attempt confirmation", async () => {
  const db = database([row]);
  const result = await getTargetIngestionSummaries(db.client, "user-a", ["target-a"]);
  expect(db.calls).toContainEqual(["from", "analysis_target_ingestion_status"]);
  expect(db.calls).toContainEqual(["eq", "owner_id", "user-a"]);
  expect(db.calls).toContainEqual(["in", "analysis_target_id", ["target-a"]]);
  expect(result.get("target-a")?.state).toBe("not_ingested");
});
it("does not invent no-ingestion for missing or truncated rows", async () => {
  const db = database([row]);
  const result = await getTargetIngestionSummaries(db.client, "user-a", ["target-a", "target-b"]);
  expect(result.has("target-b")).toBe(false);
});
it("maps persisted skipped_count into skippedCount for target-card summaries", async () => {
  const db = database([{ ...row, state: "succeeded", saved_count: 3, skipped_count: 2 }]);
  const summaries = await getTargetIngestionSummaries(db.client, "user-a", ["target-a"]);
  expect(summaries.get("target-a")).toMatchObject({
    state: "succeeded",
    savedCount: 3,
    skippedCount: 2,
  });
  const selection = db.calls.find(([operation]) => operation === "select");
  expect(String(selection?.[1]).split(", ")).toContain("skipped_count");
});
it("rejects a failed read rather than confirming an empty attempt history", async () => {
  await expect(
    getTargetIngestionSummaries(database(null, { message: "private SQL" }).client, "user-a", [
      "target-a",
    ]),
  ).rejects.toBeInstanceOf(IngestionPersistenceError);
});
it("rejects unexpected cross-user rows even if the database client misbehaves", async () => {
  await expect(
    getTargetIngestionSummaries(database([{ ...row, owner_id: "user-b" }]).client, "user-a", [
      "target-a",
    ]),
  ).rejects.toBeInstanceOf(IngestionPersistenceError);
});
