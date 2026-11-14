/** @jest-environment node */

import { getQaDataset } from "../../fixtures/qa/datasets";
import {
  expectContextOnlyForTarget,
  expectSystemPromptApplied,
  missingPromptInvariants,
  parseEvidenceRows,
  QA_INPUT_QUESTION_HEADER,
  QA_SYSTEM_PROMPT_INVARIANTS,
  reply,
  setupQaTestHarness,
  type QaEvidenceRow,
  type QaModelRequest,
} from "../../helpers/qa-harness";

const targetA = getQaDataset("targetA");

const qa = setupQaTestHarness({ fallback: reply.answered([targetA.reviews[0].id]) });

async function validRequest(): Promise<QaModelRequest> {
  const result = await qa().ask(targetA.target.id, "What about battery life?");
  if (!result.ok) throw new Error(`setup failed: ${result.errorName}`);
  return qa().model.lastCall().request;
}

const rejects = (run: () => void, message: RegExp) =>
  expect(run).toThrow(
    expect.objectContaining({
      name: "QaHarnessAssertionError",
      message: expect.stringMatching(message),
    }),
  );

/** Rebuilds the evidence section from mutated rows, keeping the question and `reviewIds`. */
function withRows(request: QaModelRequest, mutate: (rows: QaEvidenceRow[]) => unknown[]) {
  const rows = mutate(structuredClone(parseEvidenceRows(request)));
  const question = request.input.slice(
    request.input.lastIndexOf(`\n\n${QA_INPUT_QUESTION_HEADER}\n`),
  );
  return {
    ...request,
    input: `REVIEW DATASET (${rows.length} reviews, JSON array):\n${JSON.stringify(rows)}${question}`,
  };
}

describe("expectContextOnlyForTarget: full evidence projection", () => {
  it("parses the S2-013 evidence rows exactly as persisted", async () => {
    const request = await validRequest();
    expect(parseEvidenceRows(request)).toEqual(
      targetA.reviews.map((review) => ({
        id: review.id,
        rating: review.rating,
        date: review.reviewDate,
        text: review.text,
      })),
    );
    expect(() =>
      expectContextOnlyForTarget(
        withRows(request, (rows) => rows),
        targetA,
      ),
    ).not.toThrow();
  });

  it('catches the review example: "rating":5 changed to "rating":1, text and reviewIds kept', async () => {
    const request = await validRequest();
    const tampered = { ...request, input: request.input.replace('"rating":5', '"rating":1') };
    expect(tampered.input).not.toBe(request.input);
    expect(tampered.reviewIds).toEqual(request.reviewIds);
    rejects(
      () => expectContextOnlyForTarget(tampered, targetA),
      /Evidence row 1 rating is 1; expected 5/,
    );
  });

  it.each<[string, (rows: QaEvidenceRow[]) => unknown[], RegExp]>([
    [
      "a changed rating",
      (rows) => rows.map((row, i) => (i === 2 ? { ...row, rating: 1 } : row)),
      /Evidence row 3 rating is 1; expected 4/,
    ],
    [
      "a changed date",
      (rows) =>
        rows.map((row, i) => (i === 1 ? { ...row, date: "2026-01-01T00:00:00.000Z" } : row)),
      /Evidence row 2 date is "2026-01-01T00:00:00.000Z"; expected "2026-10-07/,
    ],
    [
      "a date replaced with null",
      (rows) => rows.map((row, i) => (i === 0 ? { ...row, date: null } : row)),
      /Evidence row 1 date is null/,
    ],
    [
      "a changed ID",
      (rows) =>
        rows.map((row, i) =>
          i === 2 ? { ...row, id: "2a000000-0000-4000-8000-000000000099" } : row,
        ),
      /Evidence row 3 id is "2a000000-0000-4000-8000-000000000099"/,
    ],
    [
      "changed text",
      (rows) => rows.map((row, i) => (i === 1 ? { ...row, text: `${row.text} (edited)` } : row)),
      /Evidence row 2 text/,
    ],
    ["swapped order", (rows) => [rows[1], rows[0], rows[2]], /not in persisted order/],
    ["a dropped review", (rows) => rows.slice(0, 2), /Model input has 2 reviews; targetA has 3/],
    [
      "an extra review",
      (rows) => [
        ...rows,
        { id: "2a000000-0000-4000-8000-000000000004", rating: 3, date: null, text: "Injected." },
      ],
      /Model input has 4 reviews; targetA has 3/,
    ],
    [
      "an extra field on a row",
      (rows) => rows.map((row, i) => (i === 0 ? { ...row, reviewerName: "Someone" } : row)),
      /Evidence row 1 has fields \[date,id,rating,reviewerName,text\]/,
    ],
    [
      "a missing field",
      (rows) =>
        rows.map((row, i) => (i === 0 ? { id: row.id, rating: row.rating, date: row.date } : row)),
      /Evidence row 1 has fields \[date,id,rating\]/,
    ],
    [
      "a field of the wrong type",
      (rows) => rows.map((row, i) => (i === 0 ? { ...row, rating: String(row.rating) } : row)),
      /Evidence row 1 has a field of the wrong type/,
    ],
    ["a non-object row", (rows) => [42, ...rows.slice(1)], /Evidence row 1 is not an object/],
  ])("catches %s", async (_label, mutate, message) => {
    const request = await validRequest();
    rejects(() => expectContextOnlyForTarget(withRows(request, mutate), targetA), message);
  });

  it.each<[string, (input: string) => string, RegExp]>([
    [
      "a header count that disagrees with the rows",
      (input) => input.replace("(3 reviews,", "(9 reviews,"),
      /declares 9 reviews but contains 3/,
    ],
    [
      "evidence that is not valid JSON",
      (input) => input.replace('"rating":5', '"rating":5,,'),
      /not a single valid JSON array/,
    ],
    [
      "evidence that is a JSON object, not an array",
      (input) => input.replace(/\n\[.*\]\n/, '\n{"id":"x"}\n'),
      /not a JSON array/,
    ],
    [
      "a missing REVIEW DATASET section",
      (input) => input.slice(input.indexOf(QA_INPUT_QUESTION_HEADER) - 1),
      /does not start with a REVIEW DATASET section/,
    ],
  ])("catches %s", async (_label, rewrite, message) => {
    const request = await validRequest();
    rejects(
      () => expectContextOnlyForTarget({ ...request, input: rewrite(request.input) }, targetA),
      message,
    );
  });

  it("catches reviewIds that disagree with otherwise correct evidence", async () => {
    const request = await validRequest();
    rejects(
      () =>
        expectContextOnlyForTarget(
          { ...request, reviewIds: [...request.reviewIds].reverse() },
          targetA,
        ),
      /Request reviewIds/,
    );
  });
});

describe("expectSystemPromptApplied: semantic prompt contract", () => {
  /** Removes every prompt line that states the given rules (the reference prompt has one per line). */
  const strip = (instructions: string, ids: readonly string[]) =>
    instructions
      .split("\n")
      .filter(
        (line) =>
          !QA_SYSTEM_PROMPT_INVARIANTS.some(
            (invariant) =>
              ids.includes(invariant.id) &&
              invariant.alternatives.some((patterns) =>
                patterns.every((pattern) => pattern.test(line)),
              ),
          ),
      )
      .join("\n");

  it("the reference pipeline prompt states every rule", async () => {
    const request = await validRequest();
    expect(missingPromptInvariants(request.instructions)).toEqual([]);
    expect(() => expectSystemPromptApplied(request, targetA)).not.toThrow();
  });

  it("regression: stripping the grounding and decline rules fails, even with target and platform present", async () => {
    const request = await validRequest();
    const removed = [
      "grounded-in-reviews",
      "decline-out-of-scope",
      "decline-other-entity",
      "decline-other-platform",
    ];
    const instructions = strip(request.instructions, removed);

    expect(instructions).toContain(JSON.stringify(targetA.target.name));
    expect(instructions).toContain("Google Maps");
    expect(missingPromptInvariants(instructions)).toEqual(removed);
    rejects(
      () => expectSystemPromptApplied({ ...request, instructions }, targetA),
      /missing prompt rules:\n- grounded-in-reviews .*\n- decline-out-of-scope .*\n- decline-other-entity .*\n- decline-other-platform /,
    );
  });

  it.each(QA_SYSTEM_PROMPT_INVARIANTS.map((invariant) => [invariant.id] as const))(
    "fails when only the %s rule is removed",
    async (id) => {
      const request = await validRequest();
      const instructions = strip(request.instructions, [id]);
      expect(instructions).not.toBe(request.instructions);
      expect(missingPromptInvariants(instructions)).toEqual([id]);
      rejects(
        () => expectSystemPromptApplied({ ...request, instructions }, targetA),
        new RegExp(`- ${id} `),
      );
    },
  );

  it("accepts different wording that still states every rule (not exact prose)", () => {
    const paraphrase = [
      "Use only the provided reviews as evidence for each answer.",
      "Never rely on general knowledge.",
      "When the reviews lack enough evidence, tell the user rather than guessing.",
      "Decline any question unrelated to these reviews.",
      "Decline requests about a different business or product.",
      "Decline questions about another platform's reviews.",
    ].join("\n   ");
    expect(missingPromptInvariants(paraphrase)).toEqual([]);
  });

  it("matches rules across wrapped lines, as in the S2-013 prompt", () => {
    const wrapped =
      "1. Base every answer only on the supplied\n   reviews.\n" +
      "2. Do not use outside or general\n   knowledge.\n" +
      "4. If the reviews do not contain enough information to\n   answer it, say so clearly.\n" +
      "6. Decline questions that are not about analyzing these reviews.\n" +
      "7. Decline questions about any product, business, or entity other than the active one.\n" +
      "8. Decline questions about reviews from any platform other than Google Maps.";
    expect(missingPromptInvariants(wrapped)).toEqual([]);
  });

  it("does not accept rule words scattered across sentences or only in outcome names", () => {
    const scattered =
      "Answer questions. Only this data matters. It was supplied to you. These are reviews. " +
      'Outcomes: "insufficient_evidence", "declined_general_knowledge", "declined_other_entity", ' +
      '"declined_other_platform".';
    expect(missingPromptInvariants(scattered)).toEqual(
      QA_SYSTEM_PROMPT_INVARIANTS.map((i) => i.id),
    );
  });
});
