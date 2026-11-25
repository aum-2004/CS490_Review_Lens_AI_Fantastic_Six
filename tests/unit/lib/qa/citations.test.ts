import {
  buildCitationView,
  MAX_CITED_REVIEWS,
  parseCitedReviewIds,
  responseCitations,
  type CitableReview,
} from "@/lib/qa/citations";

const TARGET_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const TARGET_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2";
const A1 = "a1a1a1a1-0000-4000-8000-000000000001";
const A2 = "a2a2a2a2-0000-4000-8000-000000000002";
const B1 = "b1b1b1b1-0000-4000-8000-000000000003";
const UNCITED = "cccccccc-0000-4000-8000-000000000004";

function review(id: string, analysisTargetId = TARGET_A, text = `Text of ${id}`): CitableReview {
  return { id, analysisTargetId, rating: 5, text, reviewDate: "2026-10-01T12:00:00Z" };
}

describe("responseCitations (server)", () => {
  it("keeps answered citations deduplicated in first-appearance order", () => {
    expect(responseCitations("answered", [A2, A1, A2])).toEqual([A2, A1]);
  });

  it.each(["insufficient_evidence", "declined_general_knowledge", "out_of_scope"])(
    "returns no citations for %s",
    (outcome) => expect(responseCitations(outcome, [A1])).toEqual([]),
  );

  it("drops non-strings and caps the list", () => {
    const many = Array.from({ length: MAX_CITED_REVIEWS + 3 }, (_, i) => `id-${i}`);
    expect(responseCitations("answered", [1, null, ...many])).toEqual(
      many.slice(0, MAX_CITED_REVIEWS),
    );
  });
});

describe("parseCitedReviewIds (client)", () => {
  it("accepts a well-formed answered citation list", () => {
    expect(parseCitedReviewIds([A1, A2.toUpperCase()], "answered")).toEqual([A1, A2.toUpperCase()]);
  });

  it.each([
    ["a missing field", undefined],
    ["an empty list", []],
  ])("rejects an answered response with %s", (_label, value) => {
    expect(parseCitedReviewIds(value, "answered")).toBeNull();
  });

  it.each([
    ["null", null],
    ["a string", A1],
    ["an object", { 0: A1 }],
    ["a number item", [A1, 7]],
    ["a non-UUID item", ["review-1"]],
    ["an empty-string item", [""]],
    ["a UUID with surrounding text", [`${A1} `]],
    ["duplicate IDs", [A1, A1]],
    ["case-insensitive duplicates", [A1, A1.toUpperCase()]],
    ["too many IDs", Array.from({ length: MAX_CITED_REVIEWS + 1 }, () => A1)],
  ])("rejects %s", (_label, value) => {
    expect(parseCitedReviewIds(value, "answered")).toBeNull();
  });

  it.each(["insufficient_evidence", "out_of_scope"])(
    "rejects citations on a %s response but accepts an empty list",
    (outcome) => {
      expect(parseCitedReviewIds([A1], outcome)).toBeNull();
      expect(parseCitedReviewIds([], outcome)).toEqual([]);
    },
  );
});

describe("buildCitationView", () => {
  const reviews = [review(A1), review(A2)];

  it("numbers citations in server order and resolves loaded reviews", () => {
    const view = buildCitationView(TARGET_A, "Answer.", [A2, A1], reviews);
    expect(view.citations).toEqual([
      { number: 1, label: "[1]", review: reviews[1] },
      { number: 2, label: "[2]", review: reviews[0] },
    ]);
  });

  it("replaces bare, bracketed, parenthesized and listed cited UUIDs case-insensitively", () => {
    const text = [
      `Bread ${A1}.`,
      `Coffee [${A2}].`,
      `Staff (${A1.toUpperCase()}).`,
      `Both [${A1}, ${A2}] and (${A2}; ${A1}).`,
    ].join(" ");
    const view = buildCitationView(TARGET_A, text, [A1, A2], reviews);
    expect(view.text).toBe("Bread [1]. Coffee [2]. Staff [1]. Both [1], [2] and [2], [1].");
    expect(view.text).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/i);
  });

  it("leaves UUID-looking strings that are not cited untouched", () => {
    const text = `Cited [${A1}], uncited [${UNCITED}], mixed [${A1}, ${UNCITED}], order ${UNCITED}.`;
    const view = buildCitationView(TARGET_A, text, [A1], reviews);
    expect(view.text).toBe(
      `Cited [1], uncited [${UNCITED}], mixed [[1], ${UNCITED}], order ${UNCITED}.`,
    );
  });

  it("does not replace a cited UUID embedded in a longer identifier", () => {
    const text = `x${A1}0 and ${A1}-suffix`;
    expect(buildCitationView(TARGET_A, text, [A1], reviews).text).toBe(text);
  });

  it("shows a validated ID that is not among the loaded reviews as unavailable", () => {
    const view = buildCitationView(TARGET_A, `See ${UNCITED}`, [UNCITED], reviews);
    expect(view.citations).toEqual([{ number: 1, label: "[1]", review: null }]);
    expect(view.text).toBe("See [1]");
  });

  it("never resolves a review that belongs to another target", () => {
    const foreign = review(B1, TARGET_B, "OTHER_TARGET_PRIVATE_TEXT");
    const sameIdOtherTarget = review(A1, TARGET_B, "WRONG_TARGET_TEXT");
    const view = buildCitationView(TARGET_A, "Answer", [B1], [foreign, ...reviews]);
    expect(view.citations[0].review).toBeNull();
    const shadowed = buildCitationView(TARGET_A, "Answer", [A1], [sameIdOtherTarget]);
    expect(shadowed.citations[0].review).toBeNull();
  });

  it("leaves the text unchanged when there are no citations", () => {
    const text = `No citations ${UNCITED}`;
    expect(buildCitationView(TARGET_A, text, [], reviews)).toEqual({ text, citations: [] });
  });
});
