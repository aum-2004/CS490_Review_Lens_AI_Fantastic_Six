/** @jest-environment node */

jest.mock("server-only", () => ({}));
jest.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: jest.fn() }));

import { MAX_QUOTE_CHARACTERS, quoteSupportedByReview } from "@/services/qa/qa-response";

import {
  answeredFromRequest,
  claimFrom,
  claimReply,
  evidenceFrom,
  quoteChunksOf,
  quoteOf,
  UNKNOWN_REVIEW_QUOTE,
  type QaModelRequest,
} from "../../helpers/qa-harness";

const R1 = {
  id: "r1",
  text: "The crust was  perfectly crisp and the sauce tasted fresh every time.",
};
const R2 = { id: "r2", text: "Too slow." };

function requestWith(rows: { id: string; text: string }[]): QaModelRequest {
  const dataset = rows.map((row) => ({ id: row.id, rating: 4, date: null, text: row.text }));
  return {
    promptVersion: "test.v1",
    targetId: "target-1",
    instructions: "rules",
    input: `REVIEW DATASET (${dataset.length} reviews, JSON array):\n${JSON.stringify(dataset)}\n\nQUESTION (JSON string):\n"q"`,
    reviewIds: rows.map((row) => row.id),
    maxOutputTokens: 100,
  };
}

describe("grounded reply builders", () => {
  it("quotes the opening words of a review as one span, or the whole text when shorter", () => {
    expect(quoteOf(R1.text)).toBe("The crust was perfectly crisp and the sauce");
    expect(quoteOf(R1.text, 3)).toBe("The crust was");
    expect(quoteOf(R2.text)).toBe("Too slow.");
  });

  it("builds evidence and claims from reviews", () => {
    expect(evidenceFrom(R2)).toEqual({ reviewId: "r2", quote: "Too slow." });
    expect(evidenceFrom(R1, "sauce tasted fresh")).toEqual({
      reviewId: "r1",
      quote: "sauce tasted fresh",
    });
    expect(claimFrom("Mixed.", R1, R2)).toEqual({
      statement: "Mixed.",
      evidence: [evidenceFrom(R1), evidenceFrom(R2)],
    });
  });

  it("builds every outcome with the {outcome, claims, coverage} shape and no free text", () => {
    const claims = [claimFrom("Crisp crust.", R1)];
    expect(claimReply.answered(claims)).toEqual({
      outcome: "answered",
      claims,
      coverage: "complete",
    });
    expect(claimReply.answered(claims, "partial").coverage).toBe("partial");
    expect(claimReply.insufficientEvidence()).toEqual({
      outcome: "insufficient_evidence",
      claims: [],
      coverage: "none",
    });
    expect(claimReply.declined("declined_other_entity")).toEqual({
      outcome: "declined_other_entity",
      claims: [],
      coverage: "none",
    });
    expect(claimReply.declined("declined_other_entity", claims).claims).toEqual(claims);
    expect(claimReply.insufficientEvidence(claims).claims).toEqual(claims);
    expect(JSON.parse(claimReply.text(claimReply.answered(claims)))).toEqual(
      claimReply.answered(claims),
    );
  });

  it("builds an uncited answer (no claims) from an empty citation list", () => {
    expect(answeredFromRequest(requestWith([R1]), [])).toEqual({
      outcome: "answered",
      claims: [],
      coverage: "complete",
    });
  });

  it("caps a quote at the validator's quote limit", () => {
    expect(quoteOf("x".repeat(MAX_QUOTE_CHARACTERS + 50))).toHaveLength(MAX_QUOTE_CHARACTERS);
  });

  it("quotes cited reviews from the request dataset, with a placeholder for unknown IDs", () => {
    const payload = answeredFromRequest(requestWith([R1, R2]), ["r2", "invented"], "S.", "partial");
    expect(payload).toEqual({
      outcome: "answered",
      claims: [
        {
          statement: "S.",
          evidence: [
            { reviewId: "r2", quote: "Too slow." },
            { reviewId: "invented", quote: UNKNOWN_REVIEW_QUOTE },
          ],
        },
      ],
      coverage: "partial",
    });
  });

  describe("quoteChunksOf", () => {
    it("returns a short text whole", () => {
      expect(quoteChunksOf(R2.text)).toEqual(["Too slow."]);
    });

    it("splits a long text into contiguous, valid quotes that cover every word", () => {
      const text = Array.from({ length: 200 }, (_, index) => `word${index}`).join(" ");
      const chunks = quoteChunksOf(text);
      expect(chunks.length).toBeGreaterThan(1);
      for (const chunk of chunks) {
        expect(chunk.length).toBeLessThanOrEqual(MAX_QUOTE_CHARACTERS);
        expect(quoteSupportedByReview(chunk, text)).toBe(true);
      }
      expect(chunks.join(" ")).toBe(text);
    });

    it("folds a tail shorter than three words into an overlapping final span", () => {
      const head = Array.from({ length: 99 }, () => "abcd").join(" "); // 494 characters
      const text = `${head} tail1 tail2`;
      const chunks = quoteChunksOf(text);
      expect(chunks.at(-1)).toBe("abcd tail1 tail2");
      for (const chunk of chunks) expect(quoteSupportedByReview(chunk, text)).toBe(true);
    });
  });
});
