/** @jest-environment node */

import { answerQuestion } from "@/services/qa/answer-question";
import { QaResponseError, type QaAnswer } from "@/services/qa/qa-response";

import {
  ADVERSARIAL_CONTEXT,
  ADVERSARIAL_TARGET_ID,
  GROUNDING_CASES,
  SEMANTIC_MISMATCH_KINDS,
  type GroundingCase,
} from "../../../fixtures/qa/grounding-adversarial";
import { createFakeQaModel, reply } from "../../../helpers/qa-harness";

jest.mock("server-only", () => ({}));

/*
 * S2-011 adversarial grounding evaluation (PR #104 review, item 1). Deterministic: every reply is
 * scripted with the S2-003 fake model and runs through the real answerQuestion pipeline. This
 * MEASURES a limitation; it is not a guarantee. A passing run means the validator still behaves
 * as documented in docs/s2-011-answers.md, including the semantic mismatches it lets through.
 */

type Result = { case: GroundingCase; answer?: QaAnswer; error?: unknown };

async function run(evaluationCase: GroundingCase): Promise<Result> {
  const model = createFakeQaModel({ fallback: reply.payload(evaluationCase.reply) });
  try {
    const answer = await answerQuestion(ADVERSARIAL_TARGET_ID, evaluationCase.question, {
      buildReviewDatasetContext: async () => ADVERSARIAL_CONTEXT,
      callModel: model.callModel,
    });
    return { case: evaluationCase, answer };
  } catch (error) {
    return { case: evaluationCase, error };
  }
}

let results: Result[];

beforeAll(async () => {
  results = await Promise.all(GROUNDING_CASES.map(run));
});

describe("adversarial grounding set", () => {
  it("covers every required kind: supported, irrelevant, partial, contradictory, and controls", () => {
    expect(new Set(GROUNDING_CASES.map((item) => item.kind))).toEqual(
      new Set([
        "supported",
        "irrelevant_quote",
        "partial_support",
        "contradictory_quote",
        "control_fabricated_quote",
        "control_wrong_review",
        "control_ellipsis_join",
      ]),
    );
  });

  it.each(GROUNDING_CASES.map((item) => [item.id, item] as const))(
    "%s: the validator behaves as recorded",
    (id) => {
      const result = results.find((item) => item.case.id === id)!;
      if (result.case.validator === "accepts") {
        expect(result.error).toBeUndefined();
        expect(result.answer?.outcome).toBe("answered");
      } else {
        expect(result.error).toBeInstanceOf(QaResponseError);
        expect(result.error).toMatchObject({ code: result.case.validator });
      }
    },
  );

  it("shows every accepted quote verbatim on the line below its statement", () => {
    for (const result of results.filter((item) => item.answer)) {
      const lines = result.answer!.answer.split("\n");
      for (const claim of result.case.reply.claims) {
        const statementLine = lines.indexOf(claim.statement);
        expect(statementLine).toBeGreaterThanOrEqual(0);
        claim.evidence.forEach((evidence, offset) => {
          expect(lines[statementLine + 1 + offset]).toBe(
            `  "${evidence.quote}" [${evidence.reviewId}]`,
          );
        });
      }
    }
  });

  it("DOCUMENTED LIMITATION (not a guarantee): the validator catches 0 of 3 semantic mismatches", () => {
    const semantic = results.filter((item) => SEMANTIC_MISMATCH_KINDS.includes(item.case.kind));
    expect(semantic).toHaveLength(3);
    expect(semantic.every((item) => !item.case.semanticallySupported)).toBe(true);
    const rejected = semantic.filter((item) => item.error !== undefined);
    // If this ever becomes non-zero, a semantic check was added: update the docs and this test.
    expect(rejected).toHaveLength(0);
  });

  it("catches 3 of 3 deterministic controls (fabricated, wrong review, ellipsis join)", () => {
    const controls = results.filter((item) => item.case.kind.startsWith("control_"));
    expect(controls).toHaveLength(3);
    expect(controls.every((item) => item.error instanceof QaResponseError)).toBe(true);
  });

  it("accepts the supported case", () => {
    const supported = results.filter((item) => item.case.kind === "supported");
    expect(supported).toHaveLength(1);
    expect(supported[0].error).toBeUndefined();
  });
});
