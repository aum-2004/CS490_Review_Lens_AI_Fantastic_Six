/** @jest-environment node */

import {
  MAX_ANSWER_CHARACTERS,
  MAX_CLAIM_STATEMENT_CHARACTERS,
  MAX_CLAIMS,
  MAX_EVIDENCE_PER_CLAIM,
  MAX_QUOTE_CHARACTERS,
  NOT_COVERED_PREFIX,
  QA_REPLY_JSON_SCHEMA,
  QaResponseError,
  normalizeEvidenceText,
  parseQaModelReply,
  quoteSupportedByReview,
  type QaEvidenceReview,
} from "@/services/qa/qa-response";
import { QA_OUTCOMES, type QaModelRequest } from "@/services/qa/system-prompt";

jest.mock("server-only", () => ({}));

const R1 = "00000000-0000-4000-8000-000000000101";
const R2 = "00000000-0000-4000-8000-000000000102";
const R3 = "00000000-0000-4000-8000-000000000103";

const reviews: QaEvidenceReview[] = [
  { id: R1, text: "The crust was perfectly crisp and the sauce tasted fresh." },
  { id: R2, text: "Delivery arrived 40 minutes late — the driver couldn’t find us." },
  { id: R3, text: "Too slow." },
];

const request: QaModelRequest = {
  promptVersion: "s2-013.v5",
  targetId: "00000000-0000-4000-8000-000000000001",
  instructions: "rules",
  input: "dataset",
  reviewIds: [R1, R2, R3],
  maxOutputTokens: 1_500,
};

const reply = (value: unknown) => JSON.stringify(value);
const answered = (claims: unknown[], note: string | null = null) =>
  reply({ outcome: "answered", claims, note });
const claim = (statement: string, ...evidence: [string, string][]) => ({
  statement,
  evidence: evidence.map(([reviewId, quote]) => ({ reviewId, quote })),
});

const CRUST_QUOTE = "The crust was perfectly crisp";

function parse(text: string, evidence: readonly QaEvidenceReview[] = reviews) {
  return parseQaModelReply(text, request, evidence);
}

function rejection(text: string, evidence: readonly QaEvidenceReview[] = reviews): unknown {
  try {
    parse(text, evidence);
  } catch (error) {
    return error;
  }
  throw new Error("Expected the reply to be rejected.");
}

type SchemaNode = {
  type?: unknown;
  properties?: Record<string, SchemaNode>;
  required?: readonly string[];
  additionalProperties?: unknown;
  items?: SchemaNode;
};

/** Every object node in the schema, with its path, for strict-mode checks. */
function objectNodes(node: SchemaNode, path = "$"): [string, SchemaNode][] {
  const nested = [
    ...Object.entries(node.properties ?? {}).flatMap(([key, child]) =>
      objectNodes(child, `${path}.${key}`),
    ),
    ...(node.items ? objectNodes(node.items, `${path}[]`) : []),
  ];
  return node.type === "object" ? [[path, node], ...nested] : nested;
}

describe("QA_REPLY_JSON_SCHEMA", () => {
  it("is strict structured-output compatible at every level", () => {
    const nodes = objectNodes(QA_REPLY_JSON_SCHEMA as unknown as SchemaNode);
    expect(nodes.map(([path]) => path)).toEqual(["$", "$.claims[]", "$.claims[].evidence[]"]);
    for (const [path, node] of nodes) {
      // Strict mode: no unknown keys, and every property listed as required.
      expect({ path, additionalProperties: node.additionalProperties }).toEqual({
        path,
        additionalProperties: false,
      });
      expect({ path, required: [...(node.required ?? [])].sort() }).toEqual({
        path,
        required: Object.keys(node.properties ?? {}).sort(),
      });
    }
  });

  it("expresses the optional note as nullable, not as a missing property", () => {
    expect(QA_REPLY_JSON_SCHEMA.properties.note.type).toEqual(["string", "null"]);
    expect(QA_REPLY_JSON_SCHEMA.required).toContain("note");
  });

  it("matches the response contract", () => {
    expect([...QA_REPLY_JSON_SCHEMA.required]).toEqual(["outcome", "claims", "note"]);
    expect(QA_REPLY_JSON_SCHEMA.properties.outcome.enum).toEqual([...QA_OUTCOMES]);
    const evidence = QA_REPLY_JSON_SCHEMA.properties.claims.items.properties.evidence.items;
    expect(Object.keys(evidence.properties)).toEqual(["reviewId", "quote"]);
  });
});

describe("normalizeEvidenceText", () => {
  it("applies NFKC, a case fold, ASCII quotes and dashes, and collapses whitespace", () => {
    expect(normalizeEvidenceText("  Ｔhe  “BEST”\n\tpizza…  ")).toBe('the "best" pizza...');
    expect(normalizeEvidenceText("Couldn’t – won‘t − STRASSE")).toBe("couldn't - won't - strasse");
    expect(normalizeEvidenceText("Straße")).toBe(normalizeEvidenceText("STRASSE"));
  });
});

describe("quoteSupportedByReview", () => {
  const text = "The crust was perfectly crisp and the sauce tasted fresh.";

  it("accepts a contiguous span of at least three words", () => {
    expect(quoteSupportedByReview("crust was perfectly", text)).toBe(true);
  });

  it("accepts a whole review even when it is shorter than three words", () => {
    expect(quoteSupportedByReview("too SLOW.", "Too slow.")).toBe(true);
  });

  it.each([
    ["an empty quote", ""],
    ["a whitespace-only quote", "   "],
    ["a quote shorter than three words", "crust was"],
    ["a quote that is not in the review", "the parking lot is safe"],
    ["fragments joined with an ASCII ellipsis", "The crust was ... tasted fresh."],
    ["fragments joined with a Unicode ellipsis", "The crust was… the sauce tasted fresh."],
  ])("rejects %s", (_label, quote) => {
    expect(quoteSupportedByReview(quote, text)).toBe(false);
  });

  it("accepts an ellipsis that is really part of the review's contiguous text", () => {
    expect(quoteSupportedByReview("Great food... slow service", "Great food… slow service.")).toBe(
      true,
    );
  });
});

describe("parseQaModelReply", () => {
  describe("supported answers", () => {
    it("composes the answer from verified claims and derives citations from the evidence", () => {
      const answer = parse(answered([claim("  Customers praise the crust.  ", [R1, CRUST_QUOTE])]));

      expect(answer).toEqual({
        outcome: "answered",
        answer: `Customers praise the crust. [${R1}]`,
        citedReviewIds: [R1],
        promptVersion: "s2-013.v5",
        targetId: request.targetId,
      });
    });

    it("accepts a quote that differs from the review only by case, whitespace and punctuation", () => {
      // Review: "Delivery arrived 40 minutes late — the driver couldn’t find us." (em dash, curly
      // apostrophe). The model's quote uses a hyphen, a straight apostrophe, other case, and a
      // line break.
      const answer = parse(
        answered([
          claim("Delivery was late.", [
            R2,
            "DELIVERY arrived 40  minutes late -\n the driver couldn't",
          ]),
        ]),
      );
      expect(answer).toMatchObject({ outcome: "answered", citedReviewIds: [R2] });
    });

    it("puts each claim on its own line, dedupes citations, and keeps first-seen order", () => {
      const answer = parse(
        answered([
          claim(
            "Delivery can be late.",
            [R2, "arrived 40 minutes late"],
            [R2, "the driver couldn't find us"],
          ),
          claim(
            "Food quality is mixed.",
            [R1, CRUST_QUOTE],
            [R2, "Delivery arrived 40"],
            [R3, "Too slow."],
          ),
        ]),
      );
      expect(answer.answer).toBe(
        `Delivery can be late. [${R2}]\nFood quality is mixed. [${R1}, ${R2}, ${R3}]`,
      );
      expect(answer.citedReviewIds).toEqual([R2, R1, R3]);
    });

    it("frames a partial answer's note with a fixed server prefix (S2-012)", () => {
      const answer = parse(
        answered([claim("Customers praise the crust.", [R1, CRUST_QUOTE])], "  Outdoor seating.  "),
      );
      expect(answer.answer).toBe(
        `Customers praise the crust. [${R1}]\n\n${NOT_COVERED_PREFIX} Outdoor seating.`,
      );
    });

    it("treats an empty note on an answered reply as no note", () => {
      const answer = parse(answered([claim("Crisp crust.", [R1, CRUST_QUOTE])], "   "));
      expect(answer.answer).toBe(`Crisp crust. [${R1}]`);
    });

    it("DOCUMENTED: note is unverified free text; it is framed, not checked", () => {
      // The prompt says note never states facts about the reviews, but nothing can verify that.
      // A finding smuggled into the note is shown after the "Not covered" prefix, unquoted.
      const answer = parse(
        answered([claim("Crisp crust.", [R1, CRUST_QUOTE])], "Parking is safe at night."),
      );
      expect(answer.answer).toBe(
        `Crisp crust. [${R1}]\n\n${NOT_COVERED_PREFIX} Parking is safe at night.`,
      );
      expect(answer.citedReviewIds).toEqual([R1]);
    });

    it("KNOWN LIMITATION: accepts a real quote that does not support the claim", () => {
      // The quote is genuinely in R1, so every deterministic check passes. Whether a quote
      // entails its statement is not decidable without a model or keyword rules; the S2-004 /
      // configured-model evaluations measure it instead.
      const answer = parse(
        answered([claim("The parking lot is safe at night.", [R1, CRUST_QUOTE])]),
      );
      expect(answer.outcome).toBe("answered");
    });
  });

  describe("claims that a valid citation does not support", () => {
    it("rejects a valid review ID whose quote is not in that review (UNSUPPORTED_CLAIM)", () => {
      const error = rejection(
        answered([claim("The parking lot is safe at night.", [R1, "the parking lot felt safe"])]),
      );
      expect(error).toBeInstanceOf(QaResponseError);
      expect(error).toMatchObject({ code: "UNSUPPORTED_CLAIM" });
    });

    it("rejects a real quote attributed to the wrong review", () => {
      expect(
        rejection(answered([claim("Delivery was late.", [R1, "arrived 40 minutes late"])])),
      ).toMatchObject({ code: "UNSUPPORTED_CLAIM" });
    });

    it("rejects the whole reply when one claim is supported and another is not", () => {
      expect(
        rejection(
          answered([
            claim("Customers praise the crust.", [R1, CRUST_QUOTE]),
            claim("Staff are friendly.", [R2, "staff were very friendly"]),
          ]),
        ),
      ).toMatchObject({ code: "UNSUPPORTED_CLAIM" });
    });

    it("rejects a claim with no evidence", () => {
      expect(
        rejection(answered([claim("Crisp crust.", [R1, CRUST_QUOTE]), claim("Uncited claim.")])),
      ).toMatchObject({ code: "UNSUPPORTED_CLAIM" });
    });

    it("rejects a quote that is too short to identify a passage", () => {
      expect(rejection(answered([claim("Crisp.", [R1, "crust was"])]))).toMatchObject({
        code: "UNSUPPORTED_CLAIM",
      });
    });

    it("rejects fragments joined with an ellipsis", () => {
      expect(
        rejection(
          answered([claim("Good pizza.", [R1, "The crust was ... the sauce tasted fresh"])]),
        ),
      ).toMatchObject({ code: "UNSUPPORTED_CLAIM" });
    });

    it("does not include model output in the error message", () => {
      const error = rejection(
        answered([claim("INVENTED_MARKER", [R1, "INVENTED_QUOTE here now"])]),
      );
      expect((error as Error).message).not.toContain("INVENTED");
    });
  });

  describe("ungrounded answers", () => {
    it("rejects an answered reply with no claims (S2-011)", () => {
      expect(rejection(answered([], "Parking is safe."))).toMatchObject({
        code: "UNGROUNDED_ANSWER",
      });
    });

    it("rejects citations of reviews that were not in the request", () => {
      const error = rejection(
        answered([
          claim(
            "INVENTED_ANSWER_MARKER",
            [R1, CRUST_QUOTE],
            ["review-from-another-target", "x y z"],
          ),
        ]),
      );
      expect(error).toMatchObject({ name: "QaResponseError", code: "UNGROUNDED_ANSWER" });
      expect((error as Error).message).not.toContain("INVENTED_ANSWER_MARKER");
      expect((error as Error).message).not.toContain("review-from-another-target");
    });

    it("rejects a requested ID whose text was not supplied as evidence", () => {
      const withoutR1 = reviews.filter((review) => review.id !== R1);
      expect(
        rejection(answered([claim("Crisp crust.", [R1, CRUST_QUOTE])]), withoutR1),
      ).toMatchObject({
        code: "UNGROUNDED_ANSWER",
      });
    });

    it("rejects supplied evidence whose ID was not in the request", () => {
      const R4 = "00000000-0000-4000-8000-000000000104";
      const extra = [...reviews, { id: R4, text: "Lovely outdoor seating area by the river." }];
      expect(
        rejection(
          answered([claim("Outdoor seating.", [R4, "Lovely outdoor seating area"])]),
          extra,
        ),
      ).toMatchObject({ code: "UNGROUNDED_ANSWER" });
    });
  });

  describe("non-answer outcomes (S2-012 and declines)", () => {
    const NON_ANSWER_OUTCOMES = [
      "insufficient_evidence",
      "declined_general_knowledge",
      "declined_other_entity",
      "declined_other_platform",
    ] as const;

    it.each(NON_ANSWER_OUTCOMES)("shows the note of %s with no citations", (outcome) => {
      const answer = parse(
        reply({ outcome, claims: [], note: " The reviews do not cover that. " }),
      );
      expect(answer).toEqual({
        outcome,
        answer: "The reviews do not cover that.",
        citedReviewIds: [],
        promptVersion: request.promptVersion,
        targetId: request.targetId,
      });
    });

    it.each(NON_ANSWER_OUTCOMES)(
      "rejects %s with valid claims as UNEXPECTED_CITATIONS",
      (outcome) => {
        const error = rejection(
          reply({ outcome, claims: [claim("Crisp crust.", [R1, CRUST_QUOTE])], note: "No." }),
        );
        expect(error).toBeInstanceOf(QaResponseError);
        expect(error).toMatchObject({ code: "UNEXPECTED_CITATIONS" });
      },
    );

    it.each(NON_ANSWER_OUTCOMES)(
      "rejects %s citing an invalid ID as UNGROUNDED_ANSWER",
      (outcome) => {
        const error = rejection(
          reply({
            outcome,
            claims: [claim("x", ["review-from-another-target", "x y z"])],
            note: "No.",
          }),
        );
        expect(error).toMatchObject({ name: "QaResponseError", code: "UNGROUNDED_ANSWER" });
      },
    );

    it.each([
      ["null", null],
      ["empty", "   "],
    ])("rejects an insufficient_evidence reply whose note is %s", (_label, note) => {
      expect(
        rejection(reply({ outcome: "insufficient_evidence", claims: [], note })),
      ).toMatchObject({ code: "INVALID_MODEL_RESPONSE" });
    });
  });

  describe("malformed replies", () => {
    const valid = claim("Crisp crust.", [R1, CRUST_QUOTE]);
    it.each([
      ["not JSON", "Customers like the crust."],
      ["JSON wrapped in prose", `Sure! ${answered([valid])}`],
      ["a non-object", reply(["answered"])],
      ["an unknown outcome", reply({ outcome: "guessed", claims: [], note: "x" })],
      ["a missing note", reply({ outcome: "answered", claims: [valid] })],
      ["the legacy reply shape", reply({ outcome: "answered", answer: "x", citedReviewIds: [R1] })],
      ["an extra field", reply({ outcome: "answered", claims: [valid], note: null, extra: 1 })],
      ["an extra claim field", answered([{ ...valid, confidence: 1 }])],
      [
        "an extra evidence field",
        answered([{ statement: "x", evidence: [{ reviewId: R1, quote: CRUST_QUOTE, page: 1 }] }]),
      ],
      ["an empty statement", answered([claim("   ", [R1, CRUST_QUOTE])])],
      [
        "a non-string quote",
        answered([{ statement: "x", evidence: [{ reviewId: R1, quote: 7 }] }]),
      ],
      [
        "an oversized statement",
        answered([claim("a".repeat(MAX_CLAIM_STATEMENT_CHARACTERS + 1), [R1, CRUST_QUOTE])]),
      ],
      ["an oversized quote", answered([claim("x", [R1, "a ".repeat(MAX_QUOTE_CHARACTERS)])])],
      ["too many claims", answered(Array.from({ length: MAX_CLAIMS + 1 }, () => valid))],
      [
        "too much evidence",
        answered([
          claim(
            "x",
            ...Array.from({ length: MAX_EVIDENCE_PER_CLAIM + 1 }, (): [string, string] => [
              R1,
              CRUST_QUOTE,
            ]),
          ),
        ]),
      ],
      [
        "an oversized note",
        reply({
          outcome: "insufficient_evidence",
          claims: [],
          note: "a".repeat(MAX_ANSWER_CHARACTERS + 1),
        }),
      ],
    ])("rejects %s as INVALID_MODEL_RESPONSE", (_label, text) => {
      const error = rejection(text);
      expect(error).toBeInstanceOf(QaResponseError);
      expect(error).toMatchObject({ code: "INVALID_MODEL_RESPONSE" });
    });

    it("rejects a composed answer longer than the display limit", () => {
      const long = claim("a".repeat(MAX_CLAIM_STATEMENT_CHARACTERS), [R1, CRUST_QUOTE]);
      const count = Math.ceil(MAX_ANSWER_CHARACTERS / MAX_CLAIM_STATEMENT_CHARACTERS);
      expect(count).toBeLessThanOrEqual(MAX_CLAIMS);
      expect(rejection(answered(Array.from({ length: count }, () => long)))).toMatchObject({
        code: "INVALID_MODEL_RESPONSE",
      });
    });
  });
});
