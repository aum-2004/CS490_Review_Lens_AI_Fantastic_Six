/** @jest-environment node */
import { createHash } from "node:crypto";

import {
  dedupeReviews,
  FINGERPRINT_KEY_PREFIX,
  normalizeIdentityText,
  normalizeSourceReviewId,
  reviewFingerprintSource,
  reviewIdentityKey,
  SOURCE_ID_KEY_PREFIX,
  type ReviewIdentityInput,
} from "@/services/reviews/review-identity";
import { normalizeReview } from "@/services/reviews/normalize";
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
  expectedKey: string;
};

const vectors = vectorFixture.vectors as Vector[];
const toInput = ({ input }: Vector): ReviewIdentityInput => ({
  ...input,
  reviewDate: input.reviewDate === undefined ? undefined : new Date(input.reviewDate),
});
const sha256 = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");

const base: ReviewIdentityInput = {
  text: "Great food",
  rating: 4.5,
  reviewerName: "Sam",
  reviewDate: new Date("2026-10-01T12:00:00.123Z"),
};

describe("golden vectors shared with PostgreSQL", () => {
  test.each(vectors.map((vector) => [vector.name, vector] as const))("%s", (_name, vector) => {
    expect(reviewIdentityKey(toInput(vector))).toBe(vector.expectedKey);
  });

  test("cover both identity types and the documented equivalences", () => {
    const keyOf = (name: string) => vectors.find((vector) => vector.name === name)!.expectedKey;
    expect(vectors.some((vector) => vector.expectedKey.startsWith(SOURCE_ID_KEY_PREFIX))).toBe(
      true,
    );
    expect(keyOf("fingerprint whitespace and ASCII case variant")).toBe(
      keyOf("fingerprint with every field"),
    );
    expect(keyOf("fingerprint decomposed accent")).toBe(keyOf("fingerprint composed accent"));
    expect(keyOf("fingerprint delimiter shift")).not.toBe(
      keyOf("fingerprint emoji and delimiters"),
    );
  });
});

describe("reviewIdentityKey", () => {
  test("is deterministic for the same input", () => {
    expect(reviewIdentityKey(base)).toBe(reviewIdentityKey({ ...base }));
    expect(reviewIdentityKey(base)).toBe(
      reviewIdentityKey({ ...base, reviewDate: new Date(base.reviewDate!.getTime()) }),
    );
  });

  test("hashes the documented, length-prefixed canonical string", () => {
    const source = "v1|3:sam|13:1790856000123|3:4.5|10:great food";
    expect(reviewFingerprintSource(base)).toBe(source);
    expect(reviewIdentityKey(base)).toBe(`${FINGERPRINT_KEY_PREFIX}${sha256(source)}`);
    expect(reviewFingerprintSource({ text: "Fine", rating: 3 })).toBe("v1|~|~|1:3|4:fine");
  });

  test("a stable source id wins over every other field", () => {
    const a = reviewIdentityKey({ ...base, sourceReviewId: "g-1" });
    const b = reviewIdentityKey({
      text: "Completely different",
      rating: 1,
      reviewerName: "Someone else",
      sourceReviewId: "g-1",
    });
    expect(a).toBe("sid:g-1");
    expect(b).toBe(a);
  });

  test("source ids are trimmed but never case-folded or Unicode-normalized", () => {
    expect(reviewIdentityKey({ ...base, sourceReviewId: "  Ab-1 \n" })).toBe("sid:Ab-1");
    expect(reviewIdentityKey({ ...base, sourceReviewId: "ab-1" })).not.toBe(
      reviewIdentityKey({ ...base, sourceReviewId: "AB-1" }),
    );
    expect(normalizeSourceReviewId("Café")).toBe("Café");
  });

  test.each([[""], ["   "], ["　\t"], [null], [undefined]])(
    "a blank or missing source id (%j) falls back to the fingerprint",
    (sourceReviewId) => {
      expect(reviewIdentityKey({ ...base, sourceReviewId: sourceReviewId as string })).toBe(
        reviewIdentityKey(base),
      );
    },
  );

  test("id and fingerprint keys never collide, even for a crafted id", () => {
    const fingerprint = reviewIdentityKey(base);
    const crafted = reviewIdentityKey({ ...base, sourceReviewId: fingerprint });
    expect(fingerprint.startsWith(FINGERPRINT_KEY_PREFIX)).toBe(true);
    expect(crafted).toBe(`${SOURCE_ID_KEY_PREFIX}${fingerprint}`);
    expect(crafted).not.toBe(fingerprint);
  });

  test.each<[string, Partial<ReviewIdentityInput>]>([
    ["text", { text: "Great fool" }],
    ["rating", { rating: 4 }],
    ["reviewer", { reviewerName: "Sasha" }],
    ["missing reviewer", { reviewerName: undefined }],
    ["date", { reviewDate: new Date("2026-10-01T12:00:00.124Z") }],
    ["missing date", { reviewDate: undefined }],
    ["source id", { sourceReviewId: "g-9" }],
  ])("different %s gives a different key", (_label, change) => {
    expect(reviewIdentityKey({ ...base, ...change })).not.toBe(reviewIdentityKey(base));
  });

  test("whitespace, ASCII case, and NFC/NFD differences do not create a new identity", () => {
    const variant = reviewIdentityKey({
      ...base,
      text: "﻿  GREAT  food \r\n",
      reviewerName: " sAM\t",
    });
    expect(variant).toBe(reviewIdentityKey(base));
    expect(reviewIdentityKey({ text: "Café", rating: 5 })).toBe(
      reviewIdentityKey({ text: "Café", rating: 5 }),
    );
  });

  test("an invalid date counts as a missing date", () => {
    expect(reviewIdentityKey({ ...base, reviewDate: new Date("nope") })).toBe(
      reviewIdentityKey({ ...base, reviewDate: undefined }),
    );
  });

  test("normalizer output for a numeric Outscraper id matches its string form", () => {
    const numeric = normalizeReview({ text: "ok", rating: 5, sourceReviewId: 12345 });
    const text = normalizeReview({ text: "ok", rating: 5, sourceReviewId: "12345" });
    if (!numeric.ok || !text.ok) throw new Error("fixture should normalize");
    expect(reviewIdentityKey(numeric.review)).toBe(reviewIdentityKey(text.review));
  });
});

describe("normalizeIdentityText", () => {
  test.each<[string | null | undefined, string | undefined]>([
    ["  Hello   World  ", "hello world"],
    ["Tabs\tand\nnew\r\nlines", "tabs and new lines"],
    ["NBSP IDEO　BOM﻿END", "nbsp ideo bom end"],
    ["École ÜBER", "École Über"],
    ["é", "é"],
    ["nul\u0000byte", "nulbyte"],
    ["cut \ud83d", "cut �"],
    ["   ", undefined],
    ["", undefined],
    [null, undefined],
    [undefined, undefined],
  ])("%j -> %j", (input, expected) => {
    expect(normalizeIdentityText(input)).toBe(expected);
  });
});

describe("dedupeReviews", () => {
  test("keeps the first occurrence of each identity, in input order", () => {
    const first = { ...base, sourceReviewId: "g-1", text: "first" };
    const editedLater = { ...base, sourceReviewId: "g-1", text: "edited later" };
    const noId = { text: "No id", rating: 3 };
    const noIdVariant = { text: "  NO  ID ", rating: 3 };
    const other = { text: "No id", rating: 4 };

    const result = dedupeReviews([first, noId, editedLater, noIdVariant, other]);

    expect(result.reviews).toEqual([first, noId, other]);
    expect(result.reviews[0]).toBe(first);
    expect(result.duplicateCount).toBe(2);
  });

  test("returns everything when nothing repeats, and handles an empty batch", () => {
    const reviews = [base, { ...base, rating: 1 }];
    expect(dedupeReviews(reviews)).toEqual({ reviews, duplicateCount: 0 });
    expect(dedupeReviews([])).toEqual({ reviews: [], duplicateCount: 0 });
  });
});
