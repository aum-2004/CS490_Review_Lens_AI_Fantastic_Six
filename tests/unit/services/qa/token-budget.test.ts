/** @jest-environment node */

import { QA_MAX_REQUEST_TOKENS, QA_RESERVED_OUTPUT_TOKENS } from "@/services/qa/system-prompt";
import {
  MAX_COUNTABLE_REQUEST_BYTES,
  QA_TOKEN_BUDGET,
  QaBudgetError,
  assertCountableSize,
  enforceTokenBudget,
  parseInputTokenCount,
} from "@/services/qa/token-budget";

jest.mock("server-only", () => ({}));

function rejection(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  throw new Error("Expected a rejection.");
}

describe("QA_TOKEN_BUDGET", () => {
  it("keeps the 16,000-token cap and 1,500-token output reservation", () => {
    expect(QA_TOKEN_BUDGET).toEqual({ maxRequestTokens: 16_000, reservedOutputTokens: 1_500 });
    expect(QA_TOKEN_BUDGET.maxRequestTokens).toBe(QA_MAX_REQUEST_TOKENS);
    expect(QA_TOKEN_BUDGET.reservedOutputTokens).toBe(QA_RESERVED_OUTPUT_TOKENS);
  });
});

describe("enforceTokenBudget", () => {
  it.each([0, 1, 14_499, 14_500])("allows %i input tokens", (tokens) => {
    expect(() => enforceTokenBudget(tokens)).not.toThrow();
  });

  it.each([14_501, 16_000, 1_000_000])("rejects %i input tokens as REQUEST_TOO_LARGE", (tokens) => {
    expect(rejection(() => enforceTokenBudget(tokens))).toMatchObject({
      name: "QaPromptError",
      code: "REQUEST_TOO_LARGE",
    });
  });

  it("applies a custom budget", () => {
    const budget = { maxRequestTokens: 100, reservedOutputTokens: 40 };
    expect(() => enforceTokenBudget(60, budget)).not.toThrow();
    expect(() => enforceTokenBudget(61, budget)).toThrow(
      expect.objectContaining({ code: "REQUEST_TOO_LARGE" }),
    );
  });
});

describe("parseInputTokenCount", () => {
  it("returns the count from a valid response", () => {
    expect(parseInputTokenCount({ object: "response.input_tokens", input_tokens: 11 })).toBe(11);
    expect(parseInputTokenCount({ object: "response.input_tokens", input_tokens: 0 })).toBe(0);
  });

  it.each<[string, unknown]>([
    ["null", null],
    ["an array", [{ object: "response.input_tokens", input_tokens: 1 }]],
    ["a string", "11"],
    ["the wrong object type", { object: "response", input_tokens: 11 }],
    ["a missing object type", { input_tokens: 11 }],
    ["a missing count", { object: "response.input_tokens" }],
    ["a string count", { object: "response.input_tokens", input_tokens: "11" }],
    ["a negative count", { object: "response.input_tokens", input_tokens: -1 }],
    ["a fractional count", { object: "response.input_tokens", input_tokens: 1.5 }],
    ["NaN", { object: "response.input_tokens", input_tokens: Number.NaN }],
    ["Infinity", { object: "response.input_tokens", input_tokens: Number.POSITIVE_INFINITY }],
    ["an unsafe integer", { object: "response.input_tokens", input_tokens: 2 ** 53 }],
  ])("fails closed for %s", (_label, body) => {
    const error = rejection(() => parseInputTokenCount(body));
    expect(error).toBeInstanceOf(QaBudgetError);
    expect(error).toMatchObject({ code: "BUDGET_CHECK_FAILED" });
    expect((error as QaBudgetError).detail).toMatch(/^Token count response had/);
  });
});

describe("assertCountableSize", () => {
  // JSON.stringify of a string adds two quote characters.
  const payloadOfBytes = (bytes: number) => "x".repeat(bytes - 2);

  it("allows a payload exactly at the ceiling and rejects one byte over", () => {
    expect(() => assertCountableSize(payloadOfBytes(MAX_COUNTABLE_REQUEST_BYTES))).not.toThrow();
    expect(
      rejection(() => assertCountableSize(payloadOfBytes(MAX_COUNTABLE_REQUEST_BYTES + 1))),
    ).toMatchObject({ name: "QaPromptError", code: "REQUEST_TOO_LARGE" });
  });

  it("measures UTF-8 bytes, not characters", () => {
    // "é" is 2 bytes in UTF-8.
    const chars = Math.floor(MAX_COUNTABLE_REQUEST_BYTES / 2);
    expect(() => assertCountableSize("é".repeat(chars))).toThrow(
      expect.objectContaining({ code: "REQUEST_TOO_LARGE" }),
    );
  });
});
