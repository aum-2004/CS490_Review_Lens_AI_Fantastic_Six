/** @jest-environment node */

jest.mock("server-only", () => ({}));
jest.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: jest.fn() }));

import {
  answeredFromRequest,
  claimFrom,
  claimReply,
  DEFAULT_DECLINE_NOTE,
  DEFAULT_INSUFFICIENT_NOTE,
  evidenceFrom,
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

  it("builds every outcome with the {outcome, claims, note} shape", () => {
    const claims = [claimFrom("Crisp crust.", R1)];
    expect(claimReply.answered(claims)).toEqual({ outcome: "answered", claims, note: null });
    expect(claimReply.answered(claims, "No seating info.").note).toBe("No seating info.");
    expect(claimReply.insufficientEvidence()).toEqual({
      outcome: "insufficient_evidence",
      claims: [],
      note: DEFAULT_INSUFFICIENT_NOTE,
    });
    expect(claimReply.declined("declined_other_entity")).toEqual({
      outcome: "declined_other_entity",
      claims: [],
      note: DEFAULT_DECLINE_NOTE,
    });
    expect(JSON.parse(claimReply.text(claimReply.answered(claims)))).toEqual(
      claimReply.answered(claims),
    );
  });

  it("quotes cited reviews from the request dataset, with a placeholder for unknown IDs", () => {
    const payload = answeredFromRequest(requestWith([R1, R2]), ["r2", "invented"], "S.", "N.");
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
      note: "N.",
    });
  });
});
