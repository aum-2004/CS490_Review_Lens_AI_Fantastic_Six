/** @jest-environment node */
import {
  getOwnedTargetOrThrow,
  TargetNotFoundError,
} from "@/services/analysis-targets/target-ownership";
import { TargetNotFoundError as ReviewsTargetNotFoundError } from "@/services/reviews/errors";

const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";
const TARGET_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const rowA = {
  id: TARGET_A,
  owner_id: USER_A,
  name: "Target A",
  platform: "google_maps",
  source_url: "https://www.google.com/maps/place/Example",
  google_place_id: null,
  created_at: "2026-11-01T00:00:00Z",
};

// Returns `row` only when every eq filter matches, like the owner-filtered query in Supabase.
// `ignoreFilters` simulates a lookup that returns a row regardless of owner.
function fakeClient(row: Record<string, unknown> | null, { ignoreFilters = false } = {}) {
  const from = jest.fn(() => {
    const filters: [string, unknown][] = [];
    const query = {
      select: () => query,
      eq: (column: string, value: unknown) => {
        filters.push([column, value]);
        return query;
      },
      maybeSingle: async () => ({
        data:
          row && (ignoreFilters || filters.every(([column, value]) => row[column] === value))
            ? row
            : null,
        error: null,
      }),
    };
    return query;
  });
  return { client: { from } as never, from };
}

async function denial(promise: Promise<unknown>) {
  const error = await promise.then(
    () => undefined,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(TargetNotFoundError);
  return { code: (error as TargetNotFoundError).code, message: (error as Error).message };
}

describe("getOwnedTargetOrThrow", () => {
  it("returns the target when it belongs to the user", async () => {
    const { client } = fakeClient(rowA);

    await expect(getOwnedTargetOrThrow(client, TARGET_A, USER_A)).resolves.toMatchObject({
      id: TARGET_A,
      ownerId: USER_A,
    });
  });

  it("throws the same denial for a foreign, missing, or malformed target", async () => {
    const foreign = await denial(getOwnedTargetOrThrow(fakeClient(rowA).client, TARGET_A, USER_B));
    const missing = await denial(getOwnedTargetOrThrow(fakeClient(null).client, TARGET_A, USER_B));
    const malformedClient = fakeClient(rowA);
    const malformed = await denial(
      getOwnedTargetOrThrow(malformedClient.client, "not-a-uuid", USER_A),
    );

    expect(foreign).toEqual({ code: "TARGET_NOT_FOUND", message: "Analysis target not found." });
    expect(missing).toEqual(foreign);
    expect(malformed).toEqual(foreign);
    expect(malformedClient.from).not.toHaveBeenCalled();
  });

  it("denies a returned row owned by someone else even if the query did not filter it", async () => {
    const { client } = fakeClient(rowA, { ignoreFilters: true });

    await denial(getOwnedTargetOrThrow(client, TARGET_A, USER_B));
  });

  it("is the same error class the review service throws", () => {
    expect(ReviewsTargetNotFoundError).toBe(TargetNotFoundError);
  });
});
