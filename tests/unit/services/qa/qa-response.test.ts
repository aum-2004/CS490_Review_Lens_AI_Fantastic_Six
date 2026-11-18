/** @jest-environment node */

import {
  MAX_ANSWER_CHARACTERS,
  MAX_CLAIM_STATEMENT_CHARACTERS,
  MAX_CLAIMS,
  MAX_EVIDENCE_PER_CLAIM,
  MAX_QUOTE_CHARACTERS,
  PARTIAL_COVERAGE_TEXT,
  PROMPT_ECHO_MIN_WORDS,
  QA_REPLY_JSON_SCHEMA,
  QaResponseError,
  echoesInstructions,
  nonAnswerText,
  normalizeEvidenceText,
  parseQaModelReply,
  quoteSupportedByReview,
  type QaEvidenceContext,
  type QaEvidenceReview,
} from "@/services/qa/qa-response";
import {
  QA_COVERAGE,
  QA_OUTCOMES,
  buildSystemPrompt,
  type QaModelRequest,
} from "@/services/qa/system-prompt";

jest.mock("server-only", () => ({}));

const R1 = "00000000-0000-4000-8000-000000000101";
const R2 = "00000000-0000-4000-8000-000000000102";
const R3 = "00000000-0000-4000-8000-000000000103";

const reviews: QaEvidenceReview[] = [
  { id: R1, text: "The crust was perfectly crisp and the sauce tasted fresh." },
  { id: R2, text: "Delivery arrived 40 minutes late — the driver couldn’t find us." },
  { id: R3, text: "Too slow." },
];

// The real v7 prompt, so the echo guard is tested against the text it protects and ordinary
// statements are checked for false positives against it.
const INSTRUCTIONS = buildSystemPrompt("Google Maps");

const request: QaModelRequest = {
  promptVersion: "s2-013.v7",
  targetId: "00000000-0000-4000-8000-000000000001",
  instructions: INSTRUCTIONS,
  input: "dataset",
  reviewIds: [R1, R2, R3],
  maxOutputTokens: 1_500,
};

const reply = (value: unknown) => JSON.stringify(value);
const answered = (claims: unknown[], coverage: string = "complete") =>
  reply({ outcome: "answered", claims, coverage });
const claim = (statement: string, ...evidence: [string, string][]) => ({
  statement,
  evidence: evidence.map(([reviewId, quote]) => ({ reviewId, quote })),
});

const CRUST_QUOTE = "The crust was perfectly crisp";
const NON_ANSWER_OUTCOMES = [
  "insufficient_evidence",
  "declined_general_knowledge",
  "declined_other_entity",
  "declined_other_platform",
] as const;

function context(evidence: readonly QaEvidenceReview[] = reviews): QaEvidenceContext {
  return { target: { platform: "google_maps" }, reviews: evidence };
}

function parse(text: string, evidence: readonly QaEvidenceReview[] = reviews) {
  return parseQaModelReply(text, request, context(evidence));
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
  enum?: readonly unknown[];
  properties?: Record<string, SchemaNode>;
  required?: readonly string[];
  additionalProperties?: unknown;
  items?: SchemaNode;
};

/** Every node in the schema, with its path. */
function allNodes(node: SchemaNode, path = "$"): [string, SchemaNode][] {
  return [
    [path, node],
    ...Object.entries(node.properties ?? {}).flatMap(([key, child]) =>
      allNodes(child, `${path}.${key}`),
    ),
    ...(node.items ? allNodes(node.items, `${path}[]`) : []),
  ];
}

describe("QA_REPLY_JSON_SCHEMA", () => {
  const nodes = allNodes(QA_REPLY_JSON_SCHEMA as unknown as SchemaNode);
  const objects = nodes.filter(([, node]) => node.type === "object");

  it("is strict structured-output compatible at every level", () => {
    expect(objects.map(([path]) => path)).toEqual(["$", "$.claims[]", "$.claims[].evidence[]"]);
    for (const [path, node] of objects) {
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

  it("gives every node a single non-null type, and every enum only values of that type", () => {
    for (const [path, node] of nodes) {
      expect({ path, type: typeof node.type }).toEqual({ path, type: "string" });
      expect(["object", "array", "string"]).toContain(node.type);
      if (node.type === "array")
        expect({ path, items: Boolean(node.items) }).toEqual({ path, items: true });
      for (const value of node.enum ?? []) expect(typeof value).toBe("string");
    }
  });

  it("matches the v7 response contract and has no free-text field besides statement", () => {
    expect([...QA_REPLY_JSON_SCHEMA.required]).toEqual(["outcome", "claims", "coverage"]);
    expect(QA_REPLY_JSON_SCHEMA.properties.outcome.enum).toEqual([...QA_OUTCOMES]);
    expect(QA_REPLY_JSON_SCHEMA.properties.coverage).toEqual({
      type: "string",
      enum: ["complete", "partial", "none"],
    });
    expect([...QA_COVERAGE]).toEqual(["complete", "partial", "none"]);
    const evidence = QA_REPLY_JSON_SCHEMA.properties.claims.items.properties.evidence.items;
    expect(Object.keys(evidence.properties)).toEqual(["reviewId", "quote"]);
    // Unconstrained strings are only the statement and the two values the validator checks.
    const freeStrings = nodes
      .filter(([, node]) => node.type === "string" && node.enum === undefined)
      .map(([path]) => path);
    expect(freeStrings).toEqual([
      "$.claims[].statement",
      "$.claims[].evidence[].reviewId",
      "$.claims[].evidence[].quote",
    ]);
    expect(JSON.stringify(QA_REPLY_JSON_SCHEMA)).not.toMatch(/note|null/);
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

describe("echoesInstructions (PROMPT_ECHO guard)", () => {
  // Rule 1 of the prompt, exactly eight words.
  const RULE_1 = "Base every answer only on the supplied reviews.";

  it("uses an eight-word window", () => {
    expect(PROMPT_ECHO_MIN_WORDS).toBe(8);
    expect(INSTRUCTIONS).toContain(RULE_1);
  });

  it("detects a true echo of eight consecutive prompt words", () => {
    expect(echoesInstructions(RULE_1, INSTRUCTIONS)).toBe(true);
  });

  it("detects an echo inside other text, re-cased and re-punctuated", () => {
    expect(
      echoesInstructions(
        "Reviewers note: BASE, every answer -- only on the supplied reviews! (ok)",
        INSTRUCTIONS,
      ),
    ).toBe(true);
  });

  it("does not flag a near miss of seven consecutive prompt words", () => {
    expect(echoesInstructions("Base every answer only on the supplied pizza.", INSTRUCTIONS)).toBe(
      false,
    );
    expect(echoesInstructions("every answer only on the supplied reviews", INSTRUCTIONS)).toBe(
      false,
    );
  });

  it.each([
    "Customers praise the crisp crust and fresh sauce.",
    "Several reviewers say delivery arrived late and the driver could not find them.",
    "The reviews describe the service as too slow.",
    "Reviewers say the supplied sauce tasted fresh and the crust was crisp.",
  ])("does not flag an ordinary supported statement: %s", (statement) => {
    expect(echoesInstructions(statement, INSTRUCTIONS)).toBe(false);
  });

  it("does not flag text shorter than the window", () => {
    expect(echoesInstructions("Base every answer", INSTRUCTIONS)).toBe(false);
    expect(echoesInstructions("", INSTRUCTIONS)).toBe(false);
  });
});

describe("nonAnswerText", () => {
  // Pinned literally, so other suites can compare against nonAnswerText() without the wording
  // being checked only by the function that produces it.
  it.each([
    [
      "insufficient_evidence",
      "These reviews don't contain enough information to answer that question.",
    ],
    [
      "declined_general_knowledge",
      "I can only answer questions about the Google Maps reviews for this target. Try asking what reviewers say about its service, quality, or prices.",
    ],
    [
      "declined_other_entity",
      "I can only analyze the Google Maps reviews for this target, not other businesses or comparisons with them. Try asking what reviewers say about this target.",
    ],
    [
      "declined_other_platform",
      "I can only analyze the Google Maps reviews for this target, not reviews from other platforms. Try asking what these reviews say.",
    ],
  ] as const)("is fixed server text for %s", (outcome, text) => {
    expect(nonAnswerText(outcome, "Google Maps")).toBe(text);
  });
});

describe("parseQaModelReply", () => {
  describe("supported answers", () => {
    it("shows each quote beside its statement and derives citations from the evidence", () => {
      const answer = parse(answered([claim("  Customers praise the crust.  ", [R1, CRUST_QUOTE])]));

      expect(answer).toEqual({
        outcome: "answered",
        answer: `Customers praise the crust.\n  "${CRUST_QUOTE}" [${R1}]`,
        citedReviewIds: [R1],
        promptVersion: "s2-013.v7",
        targetId: request.targetId,
      });
    });

    it("accepts a quote that differs from the review only by case, whitespace and punctuation", () => {
      // Review: "Delivery arrived 40 minutes late — the driver couldn’t find us." (em dash, curly
      // apostrophe). The model's quote uses a hyphen, a straight apostrophe, other case, and a
      // line break; the line break is collapsed when the quote is shown.
      const answer = parse(
        answered([
          claim("Delivery was late.", [
            R2,
            "DELIVERY arrived 40  minutes late -\n the driver couldn't",
          ]),
        ]),
      );
      expect(answer).toMatchObject({ outcome: "answered", citedReviewIds: [R2] });
      expect(answer.answer).toBe(
        `Delivery was late.\n  "DELIVERY arrived 40 minutes late - the driver couldn't" [${R2}]`,
      );
    });

    it("separates claims with a blank line, gives each quote its own ID, and dedupes citations", () => {
      const answer = parse(
        answered([
          claim(
            "Delivery can be late.",
            [R2, "arrived 40 minutes late"],
            [R2, "the driver couldn't find us"],
          ),
          claim("Food quality is mixed.", [R1, CRUST_QUOTE], [R3, "Too slow."]),
        ]),
      );
      expect(answer.answer).toBe(
        [
          "Delivery can be late.",
          `  "arrived 40 minutes late" [${R2}]`,
          `  "the driver couldn't find us" [${R2}]`,
          "",
          "Food quality is mixed.",
          `  "${CRUST_QUOTE}" [${R1}]`,
          `  "Too slow." [${R3}]`,
        ].join("\n"),
      );
      expect(answer.citedReviewIds).toEqual([R2, R1, R3]);
    });

    it("appends the fixed server line for partial coverage (S2-012)", () => {
      const answer = parse(
        answered([claim("Customers praise the crust.", [R1, CRUST_QUOTE])], "partial"),
      );
      expect(answer.answer).toBe(
        `Customers praise the crust.\n  "${CRUST_QUOTE}" [${R1}]\n\n${PARTIAL_COVERAGE_TEXT}`,
      );
    });

    it("keeps a statement on one line, so it cannot forge an extra quote line", () => {
      const forged = `Crisp crust.\n  "the parking lot is safe at night"`;
      const answer = parse(answered([claim(forged, [R1, CRUST_QUOTE])]));
      expect(answer.answer.split("\n")).toEqual([
        `Crisp crust. "the parking lot is safe at night"`,
        `  "${CRUST_QUOTE}" [${R1}]`,
      ]);
    });

    it("DOCUMENTED LIMITATION: accepts a real quote that does not support the statement, but shows it", () => {
      // The quote is genuinely in R1, so every deterministic check passes. Whether a quote
      // entails its statement is not decided here; the mismatch is made visible to the reader
      // instead (see grounding-adversarial.test.ts for the measured cases).
      const answer = parse(
        answered([claim("The parking lot is safe at night.", [R1, CRUST_QUOTE])]),
      );
      expect(answer.outcome).toBe("answered");
      expect(answer.answer).toBe(`The parking lot is safe at night.\n  "${CRUST_QUOTE}" [${R1}]`);
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
      expect(rejection(answered([]))).toMatchObject({ code: "UNGROUNDED_ANSWER" });
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

  describe("coverage (S2-012)", () => {
    it("rejects an answered reply whose coverage is none", () => {
      expect(rejection(answered([claim("Crisp crust.", [R1, CRUST_QUOTE])], "none"))).toMatchObject(
        { code: "INVALID_MODEL_RESPONSE" },
      );
    });

    it.each(
      NON_ANSWER_OUTCOMES.flatMap((outcome) => [
        [outcome, "complete"],
        [outcome, "partial"],
      ]),
    )("rejects %s with coverage %s", (outcome, coverage) => {
      expect(rejection(reply({ outcome, claims: [], coverage }))).toMatchObject({
        code: "INVALID_MODEL_RESPONSE",
      });
    });
  });

  describe("non-answer outcomes (S2-012 and declines)", () => {
    it.each(NON_ANSWER_OUTCOMES)(
      "shows the fixed server text for %s with no citations",
      (outcome) => {
        const answer = parse(reply({ outcome, claims: [], coverage: "none" }));
        expect(answer).toEqual({
          outcome,
          answer: nonAnswerText(outcome, "Google Maps"),
          citedReviewIds: [],
          promptVersion: request.promptVersion,
          targetId: request.targetId,
        });
      },
    );

    it.each(NON_ANSWER_OUTCOMES)(
      "rejects %s with valid claims as UNEXPECTED_CITATIONS",
      (outcome) => {
        const error = rejection(
          reply({ outcome, claims: [claim("Crisp crust.", [R1, CRUST_QUOTE])], coverage: "none" }),
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
            coverage: "none",
          }),
        );
        expect(error).toMatchObject({ name: "QaResponseError", code: "UNGROUNDED_ANSWER" });
      },
    );
  });

  // Item 2 of the PR #104 review: the model must not be able to put prose or prompt text in front
  // of the user through any field. Each field that reaches the user is either an enum, a value the
  // server checks against the request or the review text, or a statement checked for prompt echo.
  describe("no free-text side channel", () => {
    const valid = claim("Crisp crust.", [R1, CRUST_QUOTE]);
    const PROSE = "Parking is safe at night. ISSUE74_a_PRIVATE_METADATA_1";

    it.each([
      ["prose", PROSE],
      ["the system prompt", INSTRUCTIONS],
      ["null", null],
      ["an empty string", ""],
    ])("rejects the removed note field carrying %s, for every outcome", (_label, note) => {
      for (const outcome of QA_OUTCOMES) {
        const claims = outcome === "answered" ? [valid] : [];
        const coverage = outcome === "answered" ? "complete" : "none";
        expect(rejection(reply({ outcome, claims, coverage, note }))).toMatchObject({
          code: "INVALID_MODEL_RESPONSE",
        });
      }
    });

    it("rejects the v5 note-based reply shape", () => {
      expect(
        rejection(reply({ outcome: "insufficient_evidence", claims: [], note: PROSE })),
      ).toMatchObject({ code: "INVALID_MODEL_RESPONSE" });
    });

    it.each([
      ["a top-level answer", { answer: PROSE }],
      ["a top-level message", { message: PROSE }],
      ["a top-level explanation", { explanation: INSTRUCTIONS }],
    ])("rejects %s field", (_label, extra) => {
      expect(
        rejection(reply({ outcome: "answered", claims: [valid], coverage: "complete", ...extra })),
      ).toMatchObject({ code: "INVALID_MODEL_RESPONSE" });
    });

    it.each([
      ["a claim-level note", answered([{ ...valid, note: PROSE }])],
      [
        "an evidence-level note",
        answered([
          { statement: "x", evidence: [{ reviewId: R1, quote: CRUST_QUOTE, note: PROSE }] },
        ]),
      ],
    ])("rejects %s", (_label, text) => {
      expect(rejection(text)).toMatchObject({ code: "INVALID_MODEL_RESPONSE" });
    });

    it.each([
      ["outcome", reply({ outcome: PROSE, claims: [], coverage: "none" })],
      ["coverage", answered([valid], PROSE)],
    ])("rejects prose in the %s enum", (_label, text) => {
      expect(rejection(text)).toMatchObject({ code: "INVALID_MODEL_RESPONSE" });
    });

    it("rejects prose in a reviewId (UNGROUNDED_ANSWER)", () => {
      expect(rejection(answered([claim("Crisp crust.", [PROSE, CRUST_QUOTE])]))).toMatchObject({
        code: "UNGROUNDED_ANSWER",
      });
    });

    it("rejects prompt text in a quote (UNSUPPORTED_CLAIM)", () => {
      const promptSpan = INSTRUCTIONS.slice(0, MAX_QUOTE_CHARACTERS);
      expect(rejection(answered([claim("Crisp crust.", [R1, promptSpan])]))).toMatchObject({
        code: "UNSUPPORTED_CLAIM",
      });
    });

    it("rejects a statement that echoes the system prompt (PROMPT_ECHO)", () => {
      const echo = INSTRUCTIONS.replace(/\s+/g, " ").slice(0, MAX_CLAIM_STATEMENT_CHARACTERS);
      const error = rejection(answered([claim(echo, [R1, CRUST_QUOTE])]));
      expect(error).toBeInstanceOf(QaResponseError);
      expect(error).toMatchObject({ code: "PROMPT_ECHO" });
      expect((error as Error).message).not.toContain("ReviewLens");
    });

    it("rejects an echo hidden in a later claim, even when earlier claims are fine", () => {
      expect(
        rejection(
          answered([
            valid,
            claim("Also: base every answer only on the supplied reviews.", [R1, CRUST_QUOTE]),
          ]),
        ),
      ).toMatchObject({ code: "PROMPT_ECHO" });
    });

    it.each([
      ["as cited", R1],
      ["in upper case", R1.toUpperCase()],
      ["another requested review", R3],
    ])("rejects a review ID inside a statement (%s)", (_label, id) => {
      expect(rejection(answered([claim(`Crisp crust ${id}.`, [R1, CRUST_QUOTE])]))).toMatchObject({
        code: "INVALID_MODEL_RESPONSE",
      });
    });
  });

  describe("malformed replies", () => {
    const valid = claim("Crisp crust.", [R1, CRUST_QUOTE]);
    it.each([
      ["not JSON", "Customers like the crust."],
      ["JSON wrapped in prose", `Sure! ${answered([valid])}`],
      ["a non-object", reply(["answered"])],
      ["an unknown outcome", reply({ outcome: "guessed", claims: [], coverage: "none" })],
      ["a missing coverage", reply({ outcome: "answered", claims: [valid] })],
      ["a null coverage", reply({ outcome: "answered", claims: [valid], coverage: null })],
      ["the legacy reply shape", reply({ outcome: "answered", answer: "x", citedReviewIds: [R1] })],
      [
        "an extra field",
        reply({ outcome: "answered", claims: [valid], coverage: "complete", extra: 1 }),
      ],
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
    ])("rejects %s as INVALID_MODEL_RESPONSE", (_label, text) => {
      const error = rejection(text);
      expect(error).toBeInstanceOf(QaResponseError);
      expect(error).toMatchObject({ code: "INVALID_MODEL_RESPONSE" });
    });

    it("caps statements at 300 characters", () => {
      expect(MAX_CLAIM_STATEMENT_CHARACTERS).toBe(300);
      const statement = "a".repeat(MAX_CLAIM_STATEMENT_CHARACTERS);
      expect(parse(answered([claim(statement, [R1, CRUST_QUOTE])])).answer).toContain(statement);
    });

    it("rejects a composed answer longer than the display limit", () => {
      // Long quotes are the only way to exceed the limit now that statements are short.
      const words = Array.from({ length: 120 }, (_, index) => `word${index}`).join(" ");
      const quote = words.slice(0, MAX_QUOTE_CHARACTERS).replace(/\s+\S*$/, "");
      const longReview = { id: R1, text: words };
      const evidence = Array.from({ length: MAX_EVIDENCE_PER_CLAIM }, (): [string, string] => [
        R1,
        quote,
      ]);
      const count = Math.ceil(MAX_ANSWER_CHARACTERS / (quote.length * MAX_EVIDENCE_PER_CLAIM));
      expect(count).toBeLessThanOrEqual(MAX_CLAIMS);
      expect(
        rejection(answered(Array.from({ length: count }, () => claim("Long.", ...evidence))), [
          longReview,
        ]),
      ).toMatchObject({ code: "INVALID_MODEL_RESPONSE" });
    });
  });
});
