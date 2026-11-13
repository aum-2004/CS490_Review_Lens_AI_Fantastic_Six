/** @jest-environment node */

import {
  MAX_ANSWER_CHARACTERS,
  QA_REPLY_JSON_SCHEMA,
  QaResponseError,
  parseQaModelReply,
} from "@/services/qa/qa-response";
import { QA_OUTCOMES, type QaModelRequest } from "@/services/qa/system-prompt";

jest.mock("server-only", () => ({}));

const R1 = "00000000-0000-4000-8000-000000000101";
const R2 = "00000000-0000-4000-8000-000000000102";

const request: QaModelRequest = {
  promptVersion: "s2-013.v2",
  targetId: "00000000-0000-4000-8000-000000000001",
  instructions: "rules",
  input: "dataset",
  reviewIds: [R1, R2],
  estimatedInputTokens: 10,
  maxOutputTokens: 1_500,
};

const reply = (value: unknown) => JSON.stringify(value);

function rejection(text: string): unknown {
  try {
    parseQaModelReply(text, request);
  } catch (error) {
    return error;
  }
  throw new Error("Expected the reply to be rejected.");
}

describe("QA_REPLY_JSON_SCHEMA", () => {
  it("meets strict structured-output rules and matches the response contract", () => {
    expect(QA_REPLY_JSON_SCHEMA.additionalProperties).toBe(false);
    expect([...QA_REPLY_JSON_SCHEMA.required].sort()).toEqual(
      Object.keys(QA_REPLY_JSON_SCHEMA.properties).sort(),
    );
    expect(QA_REPLY_JSON_SCHEMA.properties.outcome.enum).toEqual([...QA_OUTCOMES]);
  });
});

describe("parseQaModelReply", () => {
  it("returns a grounded answer with its citations and request metadata", () => {
    const answer = parseQaModelReply(
      reply({
        outcome: "answered",
        answer: "  Customers praise the crust.  ",
        citedReviewIds: [R1],
      }),
      request,
    );

    expect(answer).toEqual({
      outcome: "answered",
      answer: "Customers praise the crust.",
      citedReviewIds: [R1],
      promptVersion: "s2-013.v2",
      targetId: request.targetId,
    });
  });

  it("removes duplicate citations", () => {
    const answer = parseQaModelReply(
      reply({ outcome: "answered", answer: "Late delivery.", citedReviewIds: [R2, R2, R1] }),
      request,
    );
    expect(answer.citedReviewIds).toEqual([R2, R1]);
  });

  it("keeps partial-support citations on insufficient_evidence (S2-012)", () => {
    const answer = parseQaModelReply(
      reply({
        outcome: "insufficient_evidence",
        answer: "The reviews mention parking once but say nothing about safety at night.",
        citedReviewIds: [R1],
      }),
      request,
    );
    expect(answer).toMatchObject({ outcome: "insufficient_evidence", citedReviewIds: [R1] });
  });

  it.each(["declined_general_knowledge", "declined_other_entity", "declined_other_platform"])(
    "never shows supporting evidence for %s",
    (outcome) => {
      const answer = parseQaModelReply(
        reply({ outcome, answer: "I can only analyze these reviews.", citedReviewIds: [R1] }),
        request,
      );
      expect(answer.citedReviewIds).toEqual([]);
    },
  );

  it.each([
    ["not JSON", "Customers like the crust."],
    [
      "JSON wrapped in prose",
      `Sure! ${reply({ outcome: "answered", answer: "x", citedReviewIds: [R1] })}`,
    ],
    ["a non-object", reply(["answered"])],
    ["an unknown outcome", reply({ outcome: "guessed", answer: "x", citedReviewIds: [] })],
    ["a missing field", reply({ outcome: "answered", answer: "x" })],
    ["an extra field", reply({ outcome: "answered", answer: "x", citedReviewIds: [R1], note: 1 })],
    ["an empty answer", reply({ outcome: "answered", answer: "   ", citedReviewIds: [R1] })],
    [
      "an oversized answer",
      reply({
        outcome: "answered",
        answer: "a".repeat(MAX_ANSWER_CHARACTERS + 1),
        citedReviewIds: [R1],
      }),
    ],
    ["non-string citations", reply({ outcome: "answered", answer: "x", citedReviewIds: [1] })],
  ])("rejects %s as INVALID_MODEL_RESPONSE", (_label, text) => {
    const error = rejection(text);
    expect(error).toBeInstanceOf(QaResponseError);
    expect(error).toMatchObject({ code: "INVALID_MODEL_RESPONSE" });
  });

  it("rejects citations of reviews that were not in the request", () => {
    const error = rejection(
      reply({
        outcome: "answered",
        answer: "INVENTED_ANSWER_MARKER",
        citedReviewIds: [R1, "review-from-another-target"],
      }),
    );

    expect(error).toMatchObject({ name: "QaResponseError", code: "UNGROUNDED_ANSWER" });
    expect((error as Error).message).not.toContain("INVENTED_ANSWER_MARKER");
    expect((error as Error).message).not.toContain("review-from-another-target");
  });

  it("rejects an answered reply that cites no reviews (S2-011)", () => {
    expect(
      rejection(reply({ outcome: "answered", answer: "Parking is safe.", citedReviewIds: [] })),
    ).toMatchObject({ code: "UNGROUNDED_ANSWER" });
  });
});
