/** @jest-environment node */
import type { SupabaseClient } from "@supabase/supabase-js";
import { listAnalysisTargets } from "@/services/analysis-targets/list-analysis-targets";
import { AnalysisTargetPersistenceError } from "@/services/analysis-targets/analysis-target-repository";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const rows = [
  {
    id: "a",
    owner_id: A,
    name: "A target",
    platform: "google_maps",
    source_url: "https://www.google.com/maps/place/A",
    created_at: "2026-11-02",
  },
  {
    id: "b",
    owner_id: B,
    name: "B target",
    platform: "google_maps",
    source_url: "https://www.google.com/maps/place/B",
    created_at: "2026-11-01",
  },
];

function database(source = rows, cap = 1000, fail = false) {
  const calls: unknown[][] = [];
  const client = {
    from(table: string) {
      let owner = "";
      const builder = {
        select(columns: string) {
          calls.push(["select", columns]);
          return builder;
        },
        eq(column: string, value: string) {
          owner = value;
          calls.push(["eq", column, value]);
          return builder;
        },
        order(column: string, options: unknown) {
          calls.push(["order", column, options]);
          return builder;
        },
        async limit(maximum: number) {
          calls.push(["limit", maximum]);
          return fail
            ? { data: null, error: { message: "private database error" } }
            : {
                data: source
                  .filter((row) => row.owner_id === owner)
                  .slice(0, Math.min(maximum, cap)),
                error: null,
              };
        },
      };
      calls.push(["from", table]);
      return builder;
    },
  };
  return { client: client as unknown as SupabaseClient, calls };
}

it.each([
  [A, "A target"],
  [B, "B target"],
])("queries only %s targets and returns a minimal DTO", async (owner, name) => {
  const db = database();
  const result = await listAnalysisTargets(db.client, owner);
  expect(result.map((target) => target.name)).toEqual([name]);
  expect(db.calls.filter(([method]) => method === "eq")).toEqual([["eq", "owner_id", owner]]);
  expect(result[0]).not.toHaveProperty("ownerId");
  expect(result[0]).not.toHaveProperty("googlePlaceId");
  expect(result[0].sourceUrl).toContain("/maps/place/");
});

it("uses one owner-filtered query with deterministic newest-first order", async () => {
  const db = database(rows, 1);
  await listAnalysisTargets(db.client, A);
  expect(db.calls.filter(([method]) => method === "order")).toEqual([
    ["order", "created_at", { ascending: false }],
    ["order", "id", { ascending: false }],
  ]);
  expect(db.calls.filter(([method]) => method === "from")).toHaveLength(1);
  expect(db.calls.filter(([method]) => method === "limit")).toEqual([["limit", 200]]);
});

it("bounds the read to 200 owned targets even when more exist", async () => {
  const many = Array.from({ length: 500 }, (_, i) => ({ ...rows[0], id: String(i) }));
  const db = database([...many, rows[1]]);
  const result = await listAnalysisTargets(db.client, A);
  expect(result).toHaveLength(200);
  expect(result.map((target) => target.id)).toEqual(many.slice(0, 200).map((row) => row.id));
  expect(db.calls.filter(([method]) => method === "limit")).toEqual([["limit", 200]]);
  expect(db.calls.filter(([method]) => method === "from")).toHaveLength(1);
});

it("does not start more queries when the project returns fewer rows than requested", async () => {
  const many = Array.from({ length: 500 }, (_, i) => ({ ...rows[0], id: String(i) }));
  for (const cap of [0, 1, 100]) {
    const db = database(many, cap);
    const result = await listAnalysisTargets(db.client, A);
    expect(result).toHaveLength(cap);
    expect(db.calls.filter(([method]) => method === "from")).toHaveLength(1);
    expect(
      db.calls
        .filter(([method]) => method === "eq")
        .every(([, column, owner]) => column === "owner_id" && owner === A),
    ).toBe(true);
  }
});

it("returns an empty list without substituting sample targets", async () => {
  expect(await listAnalysisTargets(database([]).client, A)).toEqual([]);
});

it("rejects a query error without returning targets or exposing SQL", async () => {
  const db = database(rows, 1000, true);
  await expect(listAnalysisTargets(db.client, A)).rejects.toBeInstanceOf(
    AnalysisTargetPersistenceError,
  );
  await expect(listAnalysisTargets(db.client, A)).rejects.toMatchObject({
    message: "Could not list the analysis target.",
  });
});

it("rejects a missing identity before querying", async () => {
  const db = database();
  await expect(listAnalysisTargets(db.client, "")).rejects.toBeInstanceOf(
    AnalysisTargetPersistenceError,
  );
  expect(db.calls).toEqual([]);
});
