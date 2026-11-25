/** @jest-environment node */
import { PATCH } from "@/app/api/analysis-targets/[targetId]/route";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAuthenticatedUser } from "@/services/auth/auth-service";

jest.mock("@/services/auth/auth-service", () => ({ getAuthenticatedUser: jest.fn() }));
jest.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: jest.fn() }));
jest.mock("next/server", () => ({ ...jest.requireActual("next/server"), connection: jest.fn() }));

const owner = "11111111-1111-4111-8111-111111111111";
const id = "33333333-3333-4333-8333-333333333333";
const stored = {
  id,
  owner_id: owner,
  name: "Original",
  source_url: "https://maps.google.com/?cid=1",
  platform: "google_maps",
  google_place_id: "place-1",
  created_at: "2026-11-01",
};

function database(error: unknown = null) {
  const row = { ...stored };
  const reviews = [{ id: "review-1", targetId: id, text: "Saved evidence" }];
  const qa = [{ targetId: id, question: "How is service?", answer: "Friendly" }];
  const filters: Record<string, unknown> = {};
  let values: Record<string, unknown>;
  const query: { update: jest.Mock; eq: jest.Mock; select: jest.Mock; maybeSingle: jest.Mock } = {
    update: jest.fn((input) => {
      values = input;
      return query;
    }),
    eq: jest.fn((key, value) => {
      filters[key] = value;
      return query;
    }),
    select: jest.fn(() => query),
    maybeSingle: jest.fn(async () => {
      if (error) return { data: null, error };
      if (filters.id !== row.id || filters.owner_id !== row.owner_id)
        return { data: null, error: null };
      Object.assign(row, values);
      return { data: row, error: null };
    }),
  };
  const from = jest.fn(() => query);
  jest.mocked(createSupabaseServerClient).mockResolvedValue({ from } as never);
  return { query, row, from, reviews, qa };
}
function patch(body: unknown, targetId = id) {
  return PATCH(
    new Request("http://localhost/api/analysis-targets/" + targetId, {
      method: "PATCH",
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
    { params: Promise.resolve({ targetId }) },
  );
}
beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, "error").mockImplementation(() => {});
  jest.mocked(getAuthenticatedUser).mockResolvedValue({ id: owner, email: "a@example.com" });
});

test.each([
  "   New name   ",
  "Robert'); DROP TABLE analysis_targets;--",
  "x' OR '1'='1",
  "<script>alert(1)</script>",
])("updates only name and treats %s as data", async (name) => {
  const db = database();
  const before = structuredClone({ row: db.row, reviews: db.reviews, qa: db.qa });
  const response = await patch({
    name,
    sourceUrl: "https://evil.example",
    owner_id: "forged",
    id: "forged",
    platform: "other",
    google_place_id: "forged",
  });
  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toContain("no-store");
  expect(db.query.update).toHaveBeenCalledWith({ name: name.trim() });
  expect(db.query.eq.mock.calls).toEqual([
    ["id", id],
    ["owner_id", owner],
  ]);
  expect(db.from).toHaveBeenCalledTimes(1);
  expect(db.from).toHaveBeenCalledWith("analysis_targets");
  expect(db.row).toEqual({ ...before.row, name: name.trim() });
  expect(db.reviews).toEqual(before.reviews);
  expect(db.qa).toEqual(before.qa);
  expect(createSupabaseServerClient).toHaveBeenCalledWith(true);
});
test.each([
  {},
  { name: "" },
  { name: "  " },
  { name: "\u200B\u200D" },
  { name: 5 },
  { name: "x".repeat(121) },
  { name: "bad\u0000name" },
  { name: "\uD800" },
  [],
  null,
  "bad json",
])("rejects unusable input %p before database access", async (body) => {
  database();
  expect((await patch(body)).status).toBe(400);
  expect(createSupabaseServerClient).not.toHaveBeenCalled();
});
test("another user cannot rename even with a forged owner in the body", async () => {
  const db = database();
  jest
    .mocked(getAuthenticatedUser)
    .mockResolvedValue({ id: "22222222-2222-4222-8222-222222222222", email: "b@example.com" });
  expect((await patch({ name: "Stolen", ownerId: owner })).status).toBe(404);
  expect(db.row).toEqual(stored);
});
test.each(["44444444-4444-4444-8444-444444444444", "bad-id", "x' OR 1=1--"])(
  "missing or invalid target %s returns 404",
  async (targetId) => {
    const db = database();
    expect((await patch({ name: "New" }, targetId)).status).toBe(404);
    expect(db.row).toEqual(stored);
    if (targetId !== "44444444-4444-4444-8444-444444444444") expect(db.from).not.toHaveBeenCalled();
  },
);
test("requires authentication before parsing or persistence", async () => {
  jest.mocked(getAuthenticatedUser).mockResolvedValue(null);
  expect((await patch("bad json")).status).toBe(401);
  expect(createSupabaseServerClient).not.toHaveBeenCalled();
});
test("fails closed when authentication is unavailable", async () => {
  jest.mocked(getAuthenticatedUser).mockRejectedValue(new Error("private-auth-details"));
  const response = await patch({ name: "New" });
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain("private-auth-details");
  expect(createSupabaseServerClient).not.toHaveBeenCalled();
});
test("database failures leave the record intact and omit diagnostics", async () => {
  const db = database({ message: "private-database-details" });
  const response = await patch({ name: "New" });
  expect(response.status).toBe(500);
  expect(await response.text()).not.toContain("private-database-details");
  expect(db.row).toEqual(stored);
});
