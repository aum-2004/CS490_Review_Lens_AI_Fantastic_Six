/** @jest-environment node */

// S2-003 harness preamble: the real Q&A pipeline imports `server-only` modules, and the fake
// Supabase is injected through this module mock (the context builder has no client seam).
jest.mock("server-only", () => ({}));
jest.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: jest.fn() }));

import { TargetNotFoundError } from "@/services/analysis-targets/target-ownership";
import { QaModelError } from "@/services/qa/openai-qa-client";
import { QaInputValidationError } from "@/services/qa/qa-request";
import { QA_REPLY_JSON_SCHEMA, QaResponseError } from "@/services/qa/qa-response";
import { ReviewContextError } from "@/services/qa/review-context";
import * as systemPrompt from "@/services/qa/system-prompt";
import { QaBudgetError } from "@/services/qa/token-budget";

import { getQaDataset } from "../../fixtures/qa/datasets";
import * as harness from "../../helpers/qa-harness";

/**
 * Runtime half of the harness/production alignment. Compile-time checks for structural types and
 * error-code membership live in `tests/helpers/qa-harness/contract-alignment.ts`. Values that
 * teammates may bump are imported, never copied, and checked here by identity.
 */
describe("harness contract alignment with production", () => {
  it("re-exports the production constants instead of copying them", () => {
    expect(harness.SYSTEM_PROMPT_VERSION).toBe(systemPrompt.SYSTEM_PROMPT_VERSION);
    expect(harness.QA_OUTCOMES).toBe(systemPrompt.QA_OUTCOMES);
    expect(harness.QA_DECLINE_OUTCOMES).toBe(systemPrompt.QA_DECLINE_PRIORITY);
    expect(harness.QA_MAX_REQUEST_TOKENS).toBe(systemPrompt.QA_MAX_REQUEST_TOKENS);
    expect(harness.QA_RESERVED_OUTPUT_TOKENS).toBe(systemPrompt.QA_RESERVED_OUTPUT_TOKENS);
    expect(harness.REVIEW_PLATFORM_LABELS).toBe(systemPrompt.REVIEW_PLATFORM_LABELS);
  });

  it("names every harness error after the real error class that throws it", () => {
    const realNames = new Set(
      [
        new TargetNotFoundError(),
        new ReviewContextError("NO_REVIEW_DATA"),
        new QaInputValidationError("QA_QUESTION_TOO_LONG", ""),
        new systemPrompt.QaPromptError("EMPTY_QUESTION", ""),
        new QaBudgetError("BUDGET_CHECK_FAILED", ""),
        new QaResponseError("INVALID_MODEL_RESPONSE"),
        new QaModelError("MODEL_FAILED"),
      ].map((error) => error.name),
    );
    for (const [key, shape] of Object.entries(harness.QA_PIPELINE_ERRORS)) {
      expect({ key, known: realNames.has(shape.name) }).toEqual({ key, known: true });
    }
  });

  it("parses the input layout the real S2-013 request builder produces", () => {
    const { target, reviews } = getQaDataset("targetA");
    const request = systemPrompt.buildQaModelRequest({
      target,
      reviews,
      question: '  Does "battery" last?  ',
    });
    expect(harness.extractQuestion(request.input)).toBe('Does "battery" last?');
    expect(request.input.split("\n")[0]).toBe(harness.QA_INPUT_TARGET_METADATA_HEADER);
    expect(harness.parseTargetMetadata(request)).toEqual({ name: target.name });
    expect(request.instructions).toContain("Authoritative review platform: Google Maps.");
    expect(request.input.split("\n")).toEqual(
      expect.arrayContaining([expect.stringMatching(harness.QA_INPUT_DATASET_HEADER_PATTERN)]),
    );
    expect(harness.parseEvidenceRows(request).map((row) => row.id)).toEqual(
      reviews.map((review) => review.id),
    );
    expect(harness.applicationSuppliedInput(request)).not.toContain(
      JSON.stringify('Does "battery" last?'),
    );
  });

  it("scripts replies with exactly the structured-output fields S2-011 requests", () => {
    const scripted = harness.reply.insufficientEvidence();
    if (scripted.kind !== "payload") throw new Error("expected a payload reply");
    expect(Object.keys(scripted.payload).sort()).toEqual([...QA_REPLY_JSON_SCHEMA.required].sort());
    const answered = harness.claimReply.answered([harness.claimFrom("x", { id: "r1", text: "t" })]);
    expect(Object.keys(answered).sort()).toEqual([...QA_REPLY_JSON_SCHEMA.required].sort());
    expect(Object.keys(answered.claims[0]).sort()).toEqual(
      [...QA_REPLY_JSON_SCHEMA.properties.claims.items.required].sort(),
    );
  });
});
