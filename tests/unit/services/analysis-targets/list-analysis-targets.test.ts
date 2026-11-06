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

function database(source = rows, cap = 1000, failAt?: number) {
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
        async range(from: number, to: number) {
          calls.push(["range", from, to]);
          return failAt !== undefined && from >= failAt
            ? { data: null, error: { message: "private database error" } }
            : {
                data: source
                  .filter((row) => row.owner_id === owner)
                  .slice(from, Math.min(to + 1, from + cap)),
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
  expect(db.calls.filter(([method]) => method === "eq")).toEqual([
    ["eq", "owner_id", owner],
    ["eq", "owner_id", owner],
  ]);
  expect(result[0]).not.toHaveProperty("ownerId");
  expect(result[0]).not.toHaveProperty("googlePlaceId");
  expect(result[0].sourceUrl).toContain("/maps/place/");
});

it("retains owner filtering and deterministic newest-first order on every page", async () => {
  const db = database(rows, 1);
  await listAnalysisTargets(db.client, A);
  expect(db.calls.filter(([method]) => method === "order")).toEqual([
    ["order", "created_at", { ascending: false }],
    ["order", "id", { ascending: false }],
    ["order", "created_at", { ascending: false }],
    ["order", "id", { ascending: false }],
  ]);
});

it("retrieves all targets beyond both the default cap and a lower project cap", async () => {
  const many = Array.from({ length: 1001 }, (_, i) => ({ ...rows[0], id: String(i) }));
  for (const cap of [1000, 400]) {
    const db = database(many, cap);
    const result = await listAnalysisTargets(db.client, A);
    expect(result).toHaveLength(1001);
    expect(new Set(result.map((row) => row.id)).size).toBe(1001);
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

it("rejects a later-page error without returning earlier targets or exposing SQL", async () => {
  const db = database([rows[0], { ...rows[0], id: "a2" }], 1, 1);
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
