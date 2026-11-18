import type { NextRequest } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getOwnedTargetOrThrow,
  TargetNotFoundError,
} from "@/services/analysis-targets/target-ownership";
import { requireApiUser } from "@/services/auth/access-control";
import { normalizeBatch } from "@/services/reviews/normalize";
import { getReviewsForTarget, saveReviews } from "@/services/reviews/review-service";
import { createSupabaseReviewStore } from "@/services/reviews/supabase-review-store";

import { errorResponse, logFailure, successResponse, targetNotFoundResponse } from "../responses";
import {
  findOversizedField,
  MAX_REQUEST_BODY_BYTES,
  MAX_REVIEWS_PER_REQUEST,
  readJsonBodyWithLimit,
} from "./review-input";

// PUT, PATCH, and DELETE are deliberately not exported (Next answers 405). The reviews table
// grants no UPDATE or DELETE to clients, so reviews cannot be modified through the app (S1-022).

export async function GET(
  _request: NextRequest,
  ctx: RouteContext<"/api/analysis-targets/[targetId]/reviews">,
) {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;
  const { targetId } = await ctx.params;

  try {
    const client = await createSupabaseServerClient(true);
    // Ownership of the parent target is proven before any review is read (S1-BR-008).
    await getOwnedTargetOrThrow(client, targetId, auth.user.id);
    const reviews = await getReviewsForTarget(
      createSupabaseReviewStore(client),
      auth.user.id,
      targetId,
    );
    return successResponse(200, reviews);
  } catch (error) {
    if (error instanceof TargetNotFoundError) return targetNotFoundResponse();
    logFailure("list-reviews", error);
    return errorResponse(
      500,
      "REVIEWS_LOAD_FAILED",
      "We couldn't load these reviews. Please try again.",
    );
  }
}

export async function POST(
  request: NextRequest,
  ctx: RouteContext<"/api/analysis-targets/[targetId]/reviews">,
) {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;
  const { targetId } = await ctx.params;

  try {
    const client = await createSupabaseServerClient(true);
    // Checked before the body is read, so a foreign target is denied before any review work.
    await getOwnedTargetOrThrow(client, targetId, auth.user.id);

    // Only `reviews` is read from the body. Any ownerId, userId, or target id in it is ignored:
    // the owner is the session user and the target is the one in the URL.
    // The body is read with a byte limit, so an oversized request never reaches parsing or insert.
    const read = await readJsonBodyWithLimit(request);
    if (!read.ok) {
      return errorResponse(
        400,
        "INVALID_REVIEW_INPUT",
        `The request body must be at most ${MAX_REQUEST_BODY_BYTES} bytes.`,
      );
    }
    const body = read.body;
    const records =
      typeof body === "object" && body !== null && "reviews" in body ? body.reviews : undefined;
    if (
      !Array.isArray(records) ||
      records.length === 0 ||
      records.length > MAX_REVIEWS_PER_REQUEST
    ) {
      return errorResponse(
        400,
        "INVALID_REVIEW_INPUT",
        `Send between 1 and ${MAX_REVIEWS_PER_REQUEST} reviews.`,
      );
    }

    // Per-field limits are checked on the raw input, so nothing oversized is normalized or stored.
    const oversized = findOversizedField(records);
    if (oversized) return errorResponse(400, "INVALID_REVIEW_INPUT", oversized);

    const { reviews, rejected } = normalizeBatch(records);
    if (rejected.length > 0) {
      // Nothing is saved when any review is invalid, so a batch is never partly stored.
      return errorResponse(
        400,
        "INVALID_REVIEW_INPUT",
        `Review ${rejected[0].index} is invalid (${rejected[0].reason}).`,
      );
    }

    const saved = await saveReviews(
      createSupabaseReviewStore(client),
      auth.user.id,
      targetId,
      reviews,
    );
    return successResponse(201, saved);
  } catch (error) {
    if (error instanceof TargetNotFoundError) return targetNotFoundResponse();
    logFailure("create-reviews", error);
    return errorResponse(
      500,
      "REVIEWS_SAVE_FAILED",
      "We couldn't save these reviews. Please try again.",
    );
  }
}
