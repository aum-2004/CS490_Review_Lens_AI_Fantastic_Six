/** @jest-environment node */

import {
  createFakeQaModel,
  extractQuestion,
  FakeQaModelError,
  reply,
  UnscriptedQaModelCallError,
  type QaModelRequest,
} from "../../helpers/qa-harness";

function request(
  question: string,
  targetId = "target-1",
  reviewIds = ["r1", "r2"],
): QaModelRequest {
  return {
    promptVersion: "test.v1",
    targetId,
    instructions: "SYSTEM PROMPT",
    input: `REVIEW DATASET (2 reviews, JSON array):\n[]\n\nQUESTION (JSON string):\n${JSON.stringify(question)}`,
    reviewIds,
    estimatedInputTokens: 10,
    maxOutputTokens: 100,
  };
}

describe("extractQuestion", () => {
  it("reads the JSON-encoded question from the S2-013 input layout", () => {
    expect(extractQuestion(request('Say "hi"\nplease').input)).toBe('Say "hi"\nplease');
  });

  it("returns undefined when the layout is absent or the question is not a JSON string", () => {
    expect(extractQuestion("no question block")).toBeUndefined();
    expect(extractQuestion("x\nQUESTION (JSON string):\nnot-json")).toBeUndefined();
    expect(extractQuestion("x\nQUESTION (JSON string):\n42")).toBeUndefined();
  });
});

describe("createFakeQaModel", () => {
  it("replies from the first matching rule, in order", async () => {
    const model = createFakeQaModel({
      rules: [
        { name: "pizza", when: { questionIncludes: "PIZZA" }, then: reply.answered(["r1"]) },
        { name: "any", when: {}, then: reply.insufficientEvidence() },
      ],
    });

    const pizza = await model.callModel(request("How is the pizza?"));
    const other = await model.callModel(request("Parking?"));

    expect(JSON.parse(pizza.text)).toEqual({
      outcome: "answered",
      answer: expect.any(String),
      citedReviewIds: ["r1"],
    });
    expect(JSON.parse(other.text).outcome).toBe("insufficient_evidence");
    expect(model.calls.map((call) => call.matchedRule)).toEqual(["pizza", "any"]);
  });

  it("requires every matcher field to match", async () => {
    const model = createFakeQaModel({
      rules: [
        {
          when: {
            question: "  Exact?  ",
            targetId: "target-2",
            predicate: (r) => r.reviewIds.length === 2,
          },
          then: reply.raw("matched"),
        },
      ],
      fallback: reply.raw("fallback"),
    });

    expect((await model.callModel(request("Exact?", "target-1"))).text).toBe("fallback");
    expect((await model.callModel(request("Exact?", "target-2", ["r1"]))).text).toBe("fallback");
    expect((await model.callModel(request("Exact?", "target-2"))).text).toBe("matched");
    expect(model.calls.map((call) => call.matchedRule)).toEqual(["fallback", "fallback", "rule#0"]);
  });

  it("stops using a rule after `times` uses until reset", async () => {
    const model = createFakeQaModel({
      rules: [{ when: {}, then: reply.raw("once"), times: 1 }],
      fallback: reply.raw("later"),
    });

    expect((await model.callModel(request("q"))).text).toBe("once");
    expect((await model.callModel(request("q"))).text).toBe("later");
    model.reset();
    expect(model.calls).toHaveLength(0);
    expect((await model.callModel(request("q"))).text).toBe("once");
  });

  it("fails loudly on an unscripted call by default and records it", async () => {
    const model = createFakeQaModel();

    await expect(model.callModel(request("Who is the president?"))).rejects.toThrow(
      UnscriptedQaModelCallError,
    );
    expect(model.lastCall()).toMatchObject({
      matchedRule: undefined,
      question: "Who is the president?",
      outcome: { kind: "error", name: "UnscriptedQaModelCallError" },
    });
  });

  it("records a deep copy of each request and its reply", async () => {
    const model = createFakeQaModel({ fallback: reply.answered(["r1"]) });
    const sent = request("q");

    await model.callModel(sent);
    sent.reviewIds.push("mutated-after-send");
    sent.instructions = "mutated";

    const [call] = model.calls;
    expect(call.request.reviewIds).toEqual(["r1", "r2"]);
    expect(call.request.instructions).toBe("SYSTEM PROMPT");
    expect(call.outcome).toEqual({ kind: "reply", reply: { text: expect.stringContaining("r1") } });
  });

  it("returns raw, empty and malformed text exactly as scripted", async () => {
    const model = createFakeQaModel({
      rules: [
        { when: { question: "raw" }, then: reply.raw("{not json") },
        { when: { question: "empty" }, then: reply.empty() },
      ],
    });

    expect(await model.callModel(request("raw"))).toEqual({ text: "{not json" });
    expect(await model.callModel(request("empty"))).toEqual({ text: "" });
  });

  it("throws scripted errors with their name and code, and records them", async () => {
    const model = createFakeQaModel({
      rules: [
        { when: { question: "provider" }, then: reply.providerError("MODEL_UNAVAILABLE") },
        { when: { question: "custom" }, then: reply.error(() => new TypeError("boom")) },
      ],
    });

    await expect(model.callModel(request("provider"))).rejects.toMatchObject({
      name: "QaModelError",
      code: "MODEL_UNAVAILABLE",
    });
    await expect(model.callModel(request("custom"))).rejects.toThrow(TypeError);
    expect(model.calls.map((call) => call.outcome)).toEqual([
      { kind: "error", name: "QaModelError", code: "MODEL_UNAVAILABLE" },
      { kind: "error", name: "TypeError", code: undefined },
    ]);
    expect(new FakeQaModelError("X")).toBeInstanceOf(Error);
  });

  it("builds dynamic replies from the request", async () => {
    const model = createFakeQaModel({
      fallback: reply.dynamic((sent, context) =>
        reply.answered(
          [sent.reviewIds[context.callIndex]],
          `call ${context.callIndex}: ${context.question}`,
        ),
      ),
    });

    const first = JSON.parse((await model.callModel(request("a"))).text);
    const second = JSON.parse((await model.callModel(request("b"))).text);

    expect(first).toMatchObject({ answer: "call 0: a", citedReviewIds: ["r1"] });
    expect(second).toMatchObject({ answer: "call 1: b", citedReviewIds: ["r2"] });
  });

  it("echoes application-supplied context but not the user's question", async () => {
    const model = createFakeQaModel({ fallback: reply.echoContext() });

    const echoed = JSON.parse((await model.callModel(request("SECRET_QUESTION_TEXT"))).text);

    expect(echoed.answer).toContain("SYSTEM PROMPT");
    expect(echoed.answer).toContain("REVIEW DATASET");
    expect(echoed.answer).not.toContain("SECRET_QUESTION_TEXT");
    expect(echoed.citedReviewIds).toEqual(["r1", "r2"]);
  });

  it("lastCall throws before any call", () => {
    expect(() => createFakeQaModel().lastCall()).toThrow("has not been called");
  });

  it("can append rules after creation", async () => {
    const model = createFakeQaModel();
    model.addRules([{ when: {}, then: reply.raw("added") }]);
    expect((await model.callModel(request("q"))).text).toBe("added");
  });

  describe("with fake timers", () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it("delays a timeout until the clock advances, then rejects with MODEL_TIMEOUT", async () => {
      const model = createFakeQaModel({ fallback: reply.timeout(30_000) });
      let settled = false;
      const pending = model.callModel(request("slow")).finally(() => {
        settled = true;
      });
      const assertion = expect(pending).rejects.toMatchObject({ code: "MODEL_TIMEOUT" });

      await jest.advanceTimersByTimeAsync(29_999);
      expect(settled).toBe(false);
      await jest.advanceTimersByTimeAsync(1);
      await assertion;
      expect(model.lastCall().outcome).toEqual({
        kind: "error",
        name: "QaModelError",
        code: "MODEL_TIMEOUT",
      });
    });
  });
});
