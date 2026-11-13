/** @jest-environment node */

import { getQaDataset } from "../../fixtures/qa/datasets";
import { QA_GOLDEN_CASES } from "../../fixtures/qa/golden-cases";
import {
  createQaTestHarness,
  reply,
  runGoldenCase,
  type QaGoldenStepRun,
} from "../../helpers/qa-harness";

/** Everything observable about a run, as plain data (error objects reduced to name and code). */
function snapshot(runs: QaGoldenStepRun[]) {
  return runs.map(({ step, result }) => ({
    question: step.question,
    actor: step.actor,
    target: step.target,
    ok: result.ok,
    answer: result.ok ? result.answer : undefined,
    error: result.ok ? undefined : [result.errorName, result.errorCode],
    calls: result.calls.map(({ request, question, matchedRule, outcome }) => ({
      request,
      question,
      matchedRule,
      outcome,
    })),
  }));
}

async function runAllGoldenCases() {
  const results = [];
  for (const goldenCase of QA_GOLDEN_CASES) {
    results.push({ id: goldenCase.id, runs: snapshot(await runGoldenCase(goldenCase)) });
  }
  return results;
}

describe("determinism", () => {
  afterEach(() => jest.useRealTimers());

  it("produces identical requests, replies and errors across 5 full golden-suite runs", async () => {
    const first = await runAllGoldenCases();
    expect(first.length).toBe(QA_GOLDEN_CASES.length);
    for (let run = 2; run <= 5; run += 1) {
      expect(await runAllGoldenCases()).toEqual(first);
    }
  });

  it("does not depend on the wall clock", async () => {
    jest.useFakeTimers({ now: new Date("2000-01-01T00:00:00.000Z") });
    const in2000 = await runAllGoldenCases();
    jest.setSystemTime(new Date("2099-12-31T23:59:59.000Z"));
    const in2099 = await runAllGoldenCases();
    expect(in2099).toEqual(in2000);
  });

  it("gives the same result for the same scenario after reset() in one harness", async () => {
    const dataset = getQaDataset("targetA");
    const harness = createQaTestHarness({ fallback: reply.answered([dataset.reviews[0].id]) });
    try {
      const first = await harness.ask(dataset.target.id, "What about battery life?");
      const firstCalls = structuredClone(harness.model.calls);
      harness.reset();
      const second = await harness.ask(dataset.target.id, "What about battery life?");

      expect(second).toEqual(first);
      expect(harness.model.calls).toEqual(firstCalls);
    } finally {
      harness.cleanup();
    }
  });

  it("runs the whole suite with the network blocked and no provider credentials", async () => {
    const harness = createQaTestHarness();
    try {
      expect(process.env.OPENAI_API_KEY).toBeUndefined();
      expect(process.env.QA_ENABLED).toBeUndefined();
      await expect(fetch("https://api.openai.com/v1/responses")).rejects.toThrow(/Blocked/);
      harness.network.clearAttempts();
    } finally {
      harness.cleanup();
    }
    // runGoldenCase installs its own guard per case; cleanup would throw on any attempt.
    await expect(runAllGoldenCases()).resolves.toHaveLength(QA_GOLDEN_CASES.length);
  });
});
