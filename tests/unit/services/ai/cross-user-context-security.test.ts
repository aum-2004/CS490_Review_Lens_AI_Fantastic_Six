/** @jest-environment node */

import type { SupabaseClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";

import { GET as getReviewsRoute } from "@/app/api/analysis-targets/[targetId]/reviews/route";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAuthenticatedUser } from "@/services/auth/auth-service";
import {
  ALPHA_PRIVATE_REVIEW_MARKER,
  BETA_PRIVATE_REVIEW_MARKER,
  crossUserAiContextFixture,
} from "../../../fixtures/cross-user-ai-context.synthetic";
import { createCrossUserSecurityStore } from "../../../helpers/cross-user-ai-context";
import { TargetNotFoundError } from "@/services/analysis-targets/target-ownership";
import { getReviewsForTarget, type ReviewStore } from "@/services/reviews/review-service";

jest.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: jest.fn() }));
jest.mock("@/services/auth/auth-service", () => ({ getAuthenticatedUser: jest.fn() }));
jest.mock("next/server", () => ({
  ...jest.requireActual("next/server"),
  connection: jest.fn().mockResolvedValue(undefined),
}));

const { users, targets, reviews, missingTargetId, spoofedIdentityClaims } =
  crossUserAiContextFixture;

function useForeignTargetRouteClient() {
  const calls: Array<[string, ...unknown[]]> = [];
  const query = {
    select: (...args: unknown[]) => (calls.push(["select", ...args]), query),
    eq: (...args: unknown[]) => (calls.push(["eq", ...args]), query),
    maybeSingle: async () => (calls.push(["maybeSingle"]), { data: null, error: null }),
  };
  const from = jest.fn((table: string) => (calls.push(["from", table]), query));

  jest.mocked(createSupabaseServerClient).mockResolvedValue({ from } as unknown as SupabaseClient);

  return { calls, from };
}

async function captureTargetDenial(store: ReviewStore, userId: string, targetId: string) {
  try {
    await getReviewsForTarget(store, userId, targetId);
    throw new Error("Expected target access to be denied.");
  } catch (error) {
    expect(error).toBeInstanceOf(TargetNotFoundError);
    return error as TargetNotFoundError;
  }
}

describe("S2-016 cross-user AI-context security foundation", () => {
  test("defines two isolated deterministic target datasets", () => {
    expect(users.userA.id).not.toBe(users.userB.id);
    expect(targets.targetA.id).not.toBe(targets.targetB.id);
    expect(targets.targetA.ownerId).toBe(users.userA.id);
    expect(targets.targetB.ownerId).toBe(users.userB.id);
    expect(reviews.targetA.every((review) => review.analysisTargetId === targets.targetA.id)).toBe(
      true,
    );
    expect(reviews.targetB.every((review) => review.analysisTargetId === targets.targetB.id)).toBe(
      true,
    );
    expect(JSON.stringify(reviews.targetA)).toContain(ALPHA_PRIVATE_REVIEW_MARKER);
    expect(JSON.stringify(reviews.targetA)).not.toContain(BETA_PRIVATE_REVIEW_MARKER);
    expect(JSON.stringify(reviews.targetB)).toContain(BETA_PRIVATE_REVIEW_MARKER);
    expect(JSON.stringify(reviews.targetB)).not.toContain(ALPHA_PRIVATE_REVIEW_MARKER);
  });

  test.each([
    ["User A", users.userA.id, targets.targetA.id, ALPHA_PRIVATE_REVIEW_MARKER],
    ["User B", users.userB.id, targets.targetB.id, BETA_PRIVATE_REVIEW_MARKER],
  ])(
    "%s can retrieve only their owned target's persisted reviews",
    async (_label, userId, targetId, marker) => {
      const { store, ownershipChecks, reviewLookups } = createCrossUserSecurityStore();

      const result = await getReviewsForTarget(store, userId, targetId);

      expect(result).toHaveLength(2);
      expect(JSON.stringify(result)).toContain(marker);
      expect(result.every((review) => review.analysisTargetId === targetId)).toBe(true);
      expect(ownershipChecks).toEqual([{ targetId, userId }]);
      expect(reviewLookups).toEqual([targetId]);
    },
  );

  test("User B cannot retrieve User A's reviews by supplying Target A's ID", async () => {
    const { store, ownershipChecks, reviewLookups } = createCrossUserSecurityStore();

    await captureTargetDenial(store, users.userB.id, targets.targetA.id);

    expect(ownershipChecks).toEqual([{ targetId: targets.targetA.id, userId: users.userB.id }]);
    expect(reviewLookups).toEqual([]);
  });

  test("a missing target and a foreign-owned target have indistinguishable denials", async () => {
    const { store, reviewLookups } = createCrossUserSecurityStore();

    const foreign = await captureTargetDenial(store, users.userB.id, targets.targetA.id);
    const missing = await captureTargetDenial(store, users.userB.id, missingTargetId);

    expect({ name: foreign.name, code: foreign.code, message: foreign.message }).toEqual({
      name: missing.name,
      code: missing.code,
      message: missing.message,
    });
    expect(reviewLookups).toEqual([]);
  });

  test("spoofed identity claims cannot replace the authenticated User B identity", async () => {
    jest.mocked(getAuthenticatedUser).mockResolvedValue(users.userB);
    const { calls, from } = useForeignTargetRouteClient();
    const query = new URLSearchParams(spoofedIdentityClaims).toString();
    const request = new NextRequest(
      `http://localhost/api/analysis-targets/${targets.targetA.id}/reviews?${query}`,
    );

    const response = await getReviewsRoute(request, {
      params: Promise.resolve({ targetId: targets.targetA.id }),
    } as never);

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: { code: "TARGET_NOT_FOUND", message: "Analysis target not found." },
    });
    expect(calls).toContainEqual(["eq", "owner_id", users.userB.id]);
    expect(calls).not.toContainEqual(["eq", "owner_id", users.userA.id]);
    expect(JSON.stringify(calls)).not.toContain(users.userA.id);
    expect(from).toHaveBeenCalledTimes(1);
    expect(from).toHaveBeenCalledWith("analysis_targets");
  });

  test("Target B lookup excludes Alpha text and metadata after a prior Target A lookup", async () => {
    const { store, reviewLookups } = createCrossUserSecurityStore();

    const priorTargetAResult = await getReviewsForTarget(store, users.userA.id, targets.targetA.id);
    const targetBResult = await getReviewsForTarget(store, users.userB.id, targets.targetB.id);
    const serializedTargetBContextCandidate = JSON.stringify(targetBResult);

    expect(JSON.stringify(priorTargetAResult)).toContain(ALPHA_PRIVATE_REVIEW_MARKER);
    expect(serializedTargetBContextCandidate).toContain(BETA_PRIVATE_REVIEW_MARKER);
    expect(serializedTargetBContextCandidate).not.toContain(ALPHA_PRIVATE_REVIEW_MARKER);
    expect(targetBResult.map((review) => review.id)).toEqual(
      reviews.targetB.map((review) => review.id),
    );
    expect(reviewLookups).toEqual([targets.targetA.id, targets.targetB.id]);
  });
});
