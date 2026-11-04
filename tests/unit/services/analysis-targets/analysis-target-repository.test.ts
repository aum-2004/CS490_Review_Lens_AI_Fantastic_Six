/** @jest-environment node */

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  AnalysisTargetPersistenceError,
  createAnalysisTarget,
  getAnalysisTargetById,
} from "@/services/analysis-targets/analysis-target-repository";

const USER_A = "11111111-1111-4111-8111-111111111111";
const TARGET_ID = "33333333-3333-4333-8333-333333333333";

const storedRow = {
  id: TARGET_ID,
  owner_id: USER_A,
  name: "Joe's Pizza",
  platform: "google_maps",
  source_url: "https://www.google.com/maps/place/Joe's+Pizza",
  google_place_id: null,
  created_at: "2026-11-03T12:00:00.000Z",
};

type QueryResult = { data: unknown; error: unknown };

// Records each builder call so tests can assert the exact query sent to Supabase.
function createFakeClient(result: QueryResult) {
  const calls: Array<[string, ...unknown[]]> = [];
  const builder = {
    insert: (...args: unknown[]) => (calls.push(["insert", ...args]), builder),
    select: (...args: unknown[]) => (calls.push(["select", ...args]), builder),
    eq: (...args: unknown[]) => (calls.push(["eq", ...args]), builder),
    single: async () => (calls.push(["single"]), result),
    maybeSingle: async () => (calls.push(["maybeSingle"]), result),
  };
  const client = {
    from: (table: string) => (calls.push(["from", table]), builder),
  };

  return { client: client as unknown as SupabaseClient, calls };
}

describe("createAnalysisTarget", () => {
  test("inserts the target with the given owner and returns the persisted values", async () => {
    const { client, calls } = createFakeClient({ data: storedRow, error: null });

    const target = await createAnalysisTarget(client, USER_A, {
      name: "Joe's Pizza",
      platform: "google_maps",
      sourceUrl: "https://www.google.com/maps/place/Joe's+Pizza",
    });

    expect(target).toEqual({
      id: TARGET_ID,
      ownerId: USER_A,
      name: "Joe's Pizza",
      platform: "google_maps",
      sourceUrl: "https://www.google.com/maps/place/Joe's+Pizza",
      googlePlaceId: null,
      createdAt: "2026-11-03T12:00:00.000Z",
    });
    expect(calls).toEqual([
      ["from", "analysis_targets"],
      [
        "insert",
        {
          owner_id: USER_A,
          name: "Joe's Pizza",
          platform: "google_maps",
          source_url: "https://www.google.com/maps/place/Joe's+Pizza",
          google_place_id: null,
        },
      ],
      ["select", "id, owner_id, name, platform, source_url, google_place_id, created_at"],
      ["single"],
    ]);
  });

  test("stores an optional Google place ID when provided", async () => {
    const placeId = "ChIJN1t_tDeuEmsRUsoyG83frY4";
    const { client, calls } = createFakeClient({
      data: { ...storedRow, google_place_id: placeId },
      error: null,
    });

    const target = await createAnalysisTarget(client, USER_A, {
      name: "Joe's Pizza",
      platform: "google_maps",
      sourceUrl: "https://www.google.com/maps/place/Joe's+Pizza",
      googlePlaceId: placeId,
    });

    expect(target.googlePlaceId).toBe(placeId);
    expect(calls.find(([method]) => method === "insert")?.[1]).toEqual(
      expect.objectContaining({ google_place_id: placeId }),
    );
  });

  test("ignores an owner field smuggled into the input", async () => {
    const { client, calls } = createFakeClient({ data: storedRow, error: null });
    const input = {
      name: "Joe's Pizza",
      platform: "google_maps" as const,
      sourceUrl: "https://www.google.com/maps/place/Joe's+Pizza",
      ownerId: "22222222-2222-4222-8222-222222222222",
      owner_id: "22222222-2222-4222-8222-222222222222",
    };

    await createAnalysisTarget(client, USER_A, input);

    const inserted = calls.find(([method]) => method === "insert")?.[1];
    expect(inserted).toEqual(expect.objectContaining({ owner_id: USER_A }));
    expect(inserted).not.toHaveProperty("ownerId");
  });

  test("throws a safe persistence error when the database rejects the insert", async () => {
    const dbError = { code: "42501", message: "new row violates row-level security policy" };
    const { client } = createFakeClient({ data: null, error: dbError });

    const attempt = createAnalysisTarget(client, USER_A, {
      name: "Joe's Pizza",
      platform: "google_maps",
      sourceUrl: "https://www.google.com/maps/place/Joe's+Pizza",
    });

    await expect(attempt).rejects.toBeInstanceOf(AnalysisTargetPersistenceError);
    await expect(attempt).rejects.toMatchObject({
      code: "ANALYSIS_TARGET_PERSISTENCE_FAILED",
      message: "Could not create the analysis target.",
      cause: dbError,
    });
  });
});

describe("getAnalysisTargetById", () => {
  test("returns the owner's target with the expected values", async () => {
    const { client, calls } = createFakeClient({ data: storedRow, error: null });

    const target = await getAnalysisTargetById(client, USER_A, TARGET_ID);

    expect(target).toEqual({
      id: TARGET_ID,
      ownerId: USER_A,
      name: "Joe's Pizza",
      platform: "google_maps",
      sourceUrl: "https://www.google.com/maps/place/Joe's+Pizza",
      googlePlaceId: null,
      createdAt: "2026-11-03T12:00:00.000Z",
    });
    expect(calls).toEqual([
      ["from", "analysis_targets"],
      ["select", "id, owner_id, name, platform, source_url, google_place_id, created_at"],
      ["eq", "id", TARGET_ID],
      ["eq", "owner_id", USER_A],
      ["maybeSingle"],
    ]);
  });

  test("returns null when no target matches the id and owner", async () => {
    const { client } = createFakeClient({ data: null, error: null });

    await expect(getAnalysisTargetById(client, USER_A, TARGET_ID)).resolves.toBeNull();
  });

  test("returns null without querying when the id is not a UUID", async () => {
    const { client, calls } = createFakeClient({ data: storedRow, error: null });

    await expect(getAnalysisTargetById(client, USER_A, "not-a-uuid")).resolves.toBeNull();
    expect(calls).toEqual([]);
  });

  test("throws a safe persistence error when the query fails", async () => {
    const dbError = { code: "08006", message: "connection failure" };
    const { client } = createFakeClient({ data: null, error: dbError });

    await expect(getAnalysisTargetById(client, USER_A, TARGET_ID)).rejects.toMatchObject({
      code: "ANALYSIS_TARGET_PERSISTENCE_FAILED",
      message: "Could not get the analysis target.",
      cause: dbError,
    });
  });
});
