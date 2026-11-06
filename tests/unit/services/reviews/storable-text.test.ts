/** @jest-environment node */

import { normalizeBatch, normalizeReview } from "@/services/reviews/normalize";
import { toStorableText } from "@/services/reviews/storable-text";

const LONE_HIGH = "\ud83d"; // first half of an emoji, cut off
const LONE_LOW = "\ude00"; // second half of an emoji on its own
const EMOJI = "😀"; // a valid surrogate pair (grinning face)

describe("toStorableText", () => {
  test("replaces a lone surrogate with U+FFFD", () => {
    expect(toStorableText(`Great${LONE_HIGH}`)).toBe("Great�");
    expect(toStorableText(`${LONE_LOW}food`)).toBe("�food");
  });

  test("leaves a valid emoji pair unchanged", () => {
    expect(toStorableText(`Great ${EMOJI} food`)).toBe(`Great ${EMOJI} food`);
  });

  test("removes NUL characters", () => {
    expect(toStorableText("Gr\u0000eat\u0000")).toBe("Great");
  });

  test("returns a well-formed string with no NUL", () => {
    const cleaned = toStorableText(`a\u0000${LONE_HIGH}b${EMOJI}${LONE_LOW}`);

    expect(cleaned.isWellFormed()).toBe(true);
    expect(cleaned).not.toContain("\u0000");
  });
});

describe("normalizeReview with malformed characters", () => {
  test("cleans lone surrogates and NUL in text and other string fields", () => {
    const result = normalizeReview({
      text: `Tasty${LONE_HIGH} ${EMOJI}\u0000`,
      rating: 5,
      sourceReviewId: `id${LONE_LOW}`,
      reviewerName: `Sam${LONE_HIGH}`,
    });

    expect(result).toEqual({
      ok: true,
      review: expect.objectContaining({
        text: `Tasty� ${EMOJI}`,
        sourceReviewId: "id�",
        reviewerName: "Sam�",
      }),
    });
  });

  test("keeps a review whose text is only a lone surrogate, as a replacement character", () => {
    expect(normalizeReview({ text: LONE_HIGH, rating: 4 })).toMatchObject({
      ok: true,
      review: { text: "�" },
    });
  });

  test("does not reject any review in a batch because of a malformed character", () => {
    const { reviews, rejected } = normalizeBatch([
      { text: "Fine", rating: 3 },
      { text: `Cut off ${LONE_HIGH}`, rating: 4 },
      { text: `Emoji ${EMOJI}`, rating: 5 },
    ]);

    expect(rejected).toEqual([]);
    expect(reviews.map((review) => review.text)).toEqual(["Fine", "Cut off �", `Emoji ${EMOJI}`]);
  });
});
