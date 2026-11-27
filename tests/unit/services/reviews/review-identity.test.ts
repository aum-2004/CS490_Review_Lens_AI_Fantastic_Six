/** @jest-environment node */
import { createHash } from "node:crypto";

import {
  collapseReviews,
  FINGERPRINT_PREFIX,
  matchStoredReview,
  mergeReviewFields,
  normalizeIdentityText,
  normalizeSourceReviewId,
  reviewFingerprint,
  reviewFingerprintSource,
  type ReviewIdentityInput,
  type StoredReviewIdentity,
} from "@/services/reviews/review-identity";
import { normalizeReview } from "@/services/reviews/normalize";
import type { NormalizedReview } from "@/services/reviews/types";
import vectorFixture from "../../../fixtures/review-identity-vectors.json";

type Vector = {
  name: string;
  input: {
    sourceReviewId?: string;
    reviewerName?: string;
    reviewDate?: string;
    rating: number;
    text: string;
  };
  expectedSourceId: string | null;
  expectedFingerprint: string;
};

const vectors = vectorFixture.vectors as Vector[];
const toInput = ({ input }: Vector): ReviewIdentityInput => ({
  ...input,
  reviewDate: input.reviewDate === undefined ? undefined : new Date(input.reviewDate),
});
const sha256 = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");

const base: NormalizedReview = {
  text: "Great food",
  rating: 4.5,
  reviewerName: "Sam",
  reviewDate: new Date("2026-10-01T12:00:00.123Z"),
};
const anonymous: NormalizedReview = { text: "Fine", rating: 3 };

const stored = (
  id: string,
  review: ReviewIdentityInput,
  createdAt: number,
  sourceReviewId: string | null = null,
): StoredReviewIdentity => ({
  id,
  sourceReviewId,
  fingerprint: reviewFingerprint(review),
  createdAt,
});

describe("golden vectors shared with PostgreSQL", () => {
  test.each(vectors.map((vector) => [vector.name, vector] as const))("%s", (_name, vector) => {
    expect(reviewFingerprint(toInput(vector))).toBe(vector.expectedFingerprint);
    expect(normalizeSourceReviewId(vector.input.sourceReviewId) ?? null).toBe(
      vector.expectedSourceId,
    );
  });

  test("cover the documented equivalences and differences", () => {
    const fp = (name: string) =>
      vectors.find((vector) => vector.name === name)!.expectedFingerprint;
    expect(fp("fingerprint whitespace and ASCII case variant")).toBe(
      fp("fingerprint with every field"),
    );
    expect(fp("author-time tier ignores an edited text")).toBe(fp("fingerprint with every field"));
    expect(fp("author-time tier ignores source id")).toBe(fp("fingerprint with every field"));
    expect(fp("fingerprint decomposed accent")).toBe(fp("fingerprint composed accent"));
    expect(fp("content tier without date, edited text")).not.toBe(fp("content tier without date"));
    expect(fp("fingerprint delimiter shift")).not.toBe(fp("fingerprint emoji and delimiters"));
  });
});

describe("reviewFingerprint", () => {
  test("is deterministic", () => {
    expect(reviewFingerprint(base)).toBe(reviewFingerprint({ ...base }));
    expect(reviewFingerprint(base)).toBe(
      reviewFingerprint({ ...base, reviewDate: new Date(base.reviewDate!.getTime()) }),
    );
  });

  test("author-time tier hashes only reviewer and time, so edits keep the identity", () => {
    const source = "v2|author-time|3:sam|13:1790856000123";
    expect(reviewFingerprintSource(base)).toBe(source);
    expect(reviewFingerprint(base)).toBe(`${FINGERPRINT_PREFIX}${sha256(source)}`);
    expect(reviewFingerprint({ ...base, text: "Edited: awful", rating: 1 })).toBe(
      reviewFingerprint(base),
    );
  });

  test("content tier applies when the reviewer or the time is missing", () => {
    expect(reviewFingerprintSource(anonymous)).toBe("v2|content|~|~|1:3|4:fine");
    expect(reviewFingerprintSource({ ...base, reviewDate: undefined })).toBe(
      "v2|content|3:sam|~|3:4.5|10:great food",
    );
    expect(reviewFingerprint({ ...anonymous, text: "Fine!" })).not.toBe(
      reviewFingerprint(anonymous),
    );
    expect(reviewFingerprint({ ...anonymous, rating: 4 })).not.toBe(reviewFingerprint(anonymous));
  });

  test.each<[string, Partial<NormalizedReview>]>([
    ["reviewer", { reviewerName: "Sasha" }],
    ["time", { reviewDate: new Date("2026-10-01T12:00:00.124Z") }],
    ["missing reviewer (tier change)", { reviewerName: undefined }],
    ["missing time (tier change)", { reviewDate: undefined }],
  ])("a different %s gives a different fingerprint", (_label, change) => {
    expect(reviewFingerprint({ ...base, ...change })).not.toBe(reviewFingerprint(base));
  });

  test("whitespace, ASCII case, and NFC/NFD differences do not change it", () => {
    expect(reviewFingerprint({ ...base, reviewerName: " sAM\t" })).toBe(reviewFingerprint(base));
    expect(reviewFingerprint({ text: "Café", rating: 5 })).toBe(
      reviewFingerprint({ text: "Café", rating: 5 }),
    );
    expect(reviewFingerprint({ ...anonymous, text: "﻿  FINE " })).toBe(
      reviewFingerprint(anonymous),
    );
  });

  test("an invalid date counts as a missing date", () => {
    expect(reviewFingerprint({ ...base, reviewDate: new Date("nope") })).toBe(
      reviewFingerprint({ ...base, reviewDate: undefined }),
    );
  });
});

describe("normalizeSourceReviewId / normalizeIdentityText", () => {
  test("source ids are trimmed, never case-folded or Unicode-normalized; blank is none", () => {
    expect(normalizeSourceReviewId("  Ab-1 \n")).toBe("Ab-1");
    expect(normalizeSourceReviewId("Café")).toBe("Café");
    expect(normalizeSourceReviewId(" 　\t")).toBeUndefined();
    expect(normalizeSourceReviewId(null)).toBeUndefined();
  });

  test("a numeric Outscraper id normalizes to its string form", () => {
    const numeric = normalizeReview({ text: "ok", rating: 5, sourceReviewId: 12345 });
    if (!numeric.ok) throw new Error("fixture should normalize");
    expect(normalizeSourceReviewId(numeric.review.sourceReviewId)).toBe("12345");
  });

  test.each<[string | null | undefined, string | undefined]>([
    ["  Hello   World  ", "hello world"],
    ["Tabs\tand\nnew\r\nlines", "tabs and new lines"],
    ["NBSP IDEO　BOM﻿END", "nbsp ideo bom end"],
    ["École ÜBER", "École Über"],
    ["é", "é"],
    ["nul\u0000byte", "nulbyte"],
    ["cut \ud83d", "cut �"],
    ["   ", undefined],
    [null, undefined],
  ])("text %j -> %j", (input, expected) => {
    expect(normalizeIdentityText(input)).toBe(expected);
  });
});

describe("matchStoredReview", () => {
  test("an incoming id matches the row with that id first", () => {
    const rows = [stored("idless", base, 1), stored("with-id", { ...base, text: "x" }, 2, "g-1")];
    expect(matchStoredReview(rows, { ...base, sourceReviewId: " g-1 " })).toEqual({
      action: "update",
      rowId: "with-id",
      matchedBy: "source_id",
    });
  });

  test("[1] an id that appears adopts the id-less row with the same fingerprint", () => {
    const rows = [stored("idless", base, 1)];
    expect(matchStoredReview(rows, { ...base, text: "edited", sourceReviewId: "g-1" })).toEqual({
      action: "adopt",
      rowId: "idless",
    });
  });

  test("[2] an id that disappears matches the id'd row by fingerprint", () => {
    const rows = [stored("with-id", base, 1, "g-1")];
    expect(matchStoredReview(rows, base)).toEqual({
      action: "update",
      rowId: "with-id",
      matchedBy: "fingerprint",
    });
  });

  test("[3] identical content with a different id is a different review", () => {
    const rows = [stored("with-id", base, 1, "g-1")];
    expect(matchStoredReview(rows, { ...base, sourceReviewId: "g-2" })).toEqual({
      action: "insert",
    });
  });

  test("[4] several id-less copies: the oldest is adopted (ties break on id)", () => {
    const rows = [
      stored("c-newest", base, 3),
      stored("b-oldest", base, 1),
      stored("a-oldest", base, 1),
      stored("other", anonymous, 0),
    ];
    expect(matchStoredReview(rows, { ...base, sourceReviewId: "g-1" })).toEqual({
      action: "adopt",
      rowId: "a-oldest",
    });
  });

  test("without an id, an id-less row is preferred over an older id'd row", () => {
    const rows = [stored("with-id", base, 1, "g-1"), stored("idless", base, 2)];
    expect(matchStoredReview(rows, base)).toMatchObject({ action: "update", rowId: "idless" });
  });

  test("a new review is inserted", () => {
    expect(matchStoredReview([stored("x", base, 1, "g-1")], anonymous)).toEqual({
      action: "insert",
    });
    expect(matchStoredReview([], { ...base, sourceReviewId: "g-1" })).toEqual({
      action: "insert",
    });
  });
});

describe("mergeReviewFields", () => {
  const storedReview: NormalizedReview = {
    ...base,
    sourceReviewId: "g-1",
    reviewUrl: "https://maps.google.com/r/1",
    sourceMetadata: { platform: "google_maps" },
  };

  test("[5] text and rating take the incoming value", () => {
    expect(mergeReviewFields(storedReview, { text: "New", rating: 1 })).toMatchObject({
      text: "New",
      rating: 1,
    });
  });

  test("[7] a missing incoming field never erases a stored value; the id is never cleared", () => {
    expect(mergeReviewFields(storedReview, { text: "New", rating: 1 })).toEqual({
      ...storedReview,
      text: "New",
      rating: 1,
    });
  });

  test("present optional fields replace stored ones; an id-less row gains the incoming id", () => {
    const merged = mergeReviewFields(
      { text: "Old", rating: 2, reviewerName: "Sam" },
      { text: "Old", rating: 2, reviewerName: "Samuel", sourceReviewId: " g-9 " },
    );
    expect(merged).toMatchObject({ reviewerName: "Samuel", sourceReviewId: "g-9" });
  });
});

describe("collapseReviews", () => {
  test("[8] repeats in one batch become one review; the last occurrence wins", () => {
    const result = collapseReviews([
      { ...base, sourceReviewId: "g-1", text: "first", reviewUrl: "https://maps.google.com/r/1" },
      anonymous,
      { ...base, sourceReviewId: "g-1", text: "second", rating: 2 },
      { ...anonymous, text: "  FINE " },
    ]);
    expect(result.duplicateCount).toBe(2);
    expect(result.reviews).toEqual([
      {
        ...base,
        sourceReviewId: "g-1",
        text: "second",
        rating: 2,
        reviewUrl: "https://maps.google.com/r/1",
        sourceMetadata: undefined,
      },
      { ...anonymous, text: "  FINE ", sourceReviewId: undefined },
    ]);
  });

  test("an id appearing or disappearing inside one batch is still one review", () => {
    const appears = collapseReviews([base, { ...base, sourceReviewId: "g-1", text: "edited" }]);
    const disappears = collapseReviews([{ ...base, sourceReviewId: "g-1" }, base]);
    expect(appears.reviews).toHaveLength(1);
    expect(appears.reviews[0]).toMatchObject({ sourceReviewId: "g-1", text: "edited" });
    expect(disappears.reviews).toHaveLength(1);
    expect(disappears.reviews[0].sourceReviewId).toBe("g-1");
  });

  test("[3] identical content with different ids stays separate", () => {
    const result = collapseReviews([
      { ...base, sourceReviewId: "g-1" },
      { ...base, sourceReviewId: "g-2" },
    ]);
    expect(result.reviews.map((review) => review.sourceReviewId)).toEqual(["g-1", "g-2"]);
    expect(result.duplicateCount).toBe(0);
  });

  test("returns everything when nothing repeats, and handles an empty batch", () => {
    expect(collapseReviews([base, anonymous])).toEqual({
      reviews: [base, anonymous],
      duplicateCount: 0,
    });
    expect(collapseReviews([])).toEqual({ reviews: [], duplicateCount: 0 });
  });
});
