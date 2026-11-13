/** @jest-environment node */

import { GET } from "@/app/api/analysis-targets/[targetId]/review-summary/route";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getOwnedTargetOrThrow,
  TargetNotFoundError,
} from "@/services/analysis-targets/target-ownership";
import { requireApiUser } from "@/services/auth/access-control";
import { ReviewPersistenceError } from "@/services/reviews/errors";
import { getReviewSummary } from "@/services/reviews/review-summary";
import { createSupabaseReviewStore } from "@/services/reviews/supabase-review-store";
import { NextRequest, NextResponse } from "next/server";

jest.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: jest.fn() }));
jest.mock("@/services/auth/access-control", () => ({ requireApiUser: jest.fn() }));
jest.mock("@/services/analysis-targets/target-ownership", () => ({
  TargetNotFoundError: class TargetNotFoundError extends Error {
    code = "TARGET_NOT_FOUND";
  },
  getOwnedTargetOrThrow: jest.fn(),
}));
jest.mock("@/services/reviews/review-summary", () => ({ getReviewSummary: jest.fn() }));
jest.mock("@/services/reviews/supabase-review-store", () => ({
  createSupabaseReviewStore: jest.fn(),
}));

const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";
const TARGET_A = "33333333-3333-4333-8333-333333333333";

const summary = {
  targetId: TARGET_A,
  reviewCount: 1001,
  averageRating: 3.25,
  ingestionStatus: "succeeded" as const,
  skippedCount: 2,
};

function context(targetId = TARGET_A) {
  return { params: Promise.resolve({ targetId }) };
}

function request(query = "") {
  return new NextRequest(
    `http://localhost/api/analysis-targets/${TARGET_A}/review-summary${query}`,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, "error").mockImplementation(() => {});
  jest.mocked(requireApiUser).mockResolvedValue({ user: { id: USER_A, email: null } });
  jest.mocked(createSupabaseServerClient).mockResolvedValue({} as never);
  jest.mocked(getOwnedTargetOrThrow).mockResolvedValue({} as never);
  jest.mocked(createSupabaseReviewStore).mockReturnValue({} as never);
  jest.mocked(getReviewSummary).mockResolvedValue(summary);
});

afterEach(() => jest.restoreAllMocks());

it("returns 401 without checking ownership or reviews when unauthenticated", async () => {
  jest.mocked(requireApiUser).mockResolvedValue({
    response: NextResponse.json(
      { success: false, error: { code: "AUTH_REQUIRED" } },
      { status: 401 },
    ),
  });

  const response = await GET(request(), context());

  expect(response.status).toBe(401);
  expect(createSupabaseServerClient).not.toHaveBeenCalled();
  expect(getOwnedTargetOrThrow).not.toHaveBeenCalled();
  expect(getReviewSummary).not.toHaveBeenCalled();
});

it("returns the authenticated owner's exact summary with private no-store caching", async () => {
  const response = await GET(request("?userId=" + USER_B), context());

  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toEqual({ success: true, data: summary });
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(response.headers.get("cache-control")).toContain("private");
  expect(getOwnedTargetOrThrow).toHaveBeenCalledWith({}, TARGET_A, USER_A);
  expect(getReviewSummary).toHaveBeenCalledWith({}, {}, USER_A, TARGET_A);
});

it.each(["missing", "foreign"])("uses the same 404 response for %s targets", async () => {
  jest.mocked(getOwnedTargetOrThrow).mockRejectedValue(new TargetNotFoundError());

  const first = await GET(request(), context());
  const firstBody = await first.text();
  jest.mocked(getOwnedTargetOrThrow).mockRejectedValue(new TargetNotFoundError());
  const second = await GET(request(), context());
  const secondBody = await second.text();

  expect(first.status).toBe(404);
  expect(second.status).toBe(404);
  expect(firstBody).toBe(secondBody);
  expect(getReviewSummary).not.toHaveBeenCalled();
});

it("returns a sanitized 500 when the ownership query fails", async () => {
  jest.mocked(getOwnedTargetOrThrow).mockRejectedValue(new Error("private SQL secret"));

  const response = await GET(request(), context());
  const body = await response.text();

  expect(response.status).toBe(500);
  expect(body).not.toContain("private SQL secret");
  expect(body).toContain("REVIEW_SUMMARY_LOAD_FAILED");
  expect(getReviewSummary).not.toHaveBeenCalled();
});

it.each([
  ["aggregate", new ReviewPersistenceError("summary", { cause: new Error("private review text") })],
  ["ingestion attempt", new Error("private ingestion SQL secret")],
])("returns a sanitized 500 when the %s query fails", async (_source, failure) => {
  jest.mocked(getReviewSummary).mockRejectedValue(failure);

  const response = await GET(request(), context());
  const body = await response.text();

  expect(response.status).toBe(500);
  expect(body).not.toContain("private");
  expect(body).toContain("REVIEW_SUMMARY_LOAD_FAILED");
});

it("does not allow a client-provided user ID to override the authenticated identity", async () => {
  await GET(request("?ownerId=" + USER_B), context());

  expect(getOwnedTargetOrThrow).toHaveBeenCalledWith({}, TARGET_A, USER_A);
  expect(getReviewSummary).toHaveBeenCalledWith({}, {}, USER_A, TARGET_A);
});

it("does not retrieve a foreign user's summary", async () => {
  jest.mocked(requireApiUser).mockResolvedValue({ user: { id: USER_B, email: null } });
  jest.mocked(getOwnedTargetOrThrow).mockRejectedValue(new TargetNotFoundError());

  const response = await GET(request(), context());

  expect(response.status).toBe(404);
  expect(getReviewSummary).not.toHaveBeenCalled();
});
