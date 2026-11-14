/** @jest-environment node */

import { getQaDataset, QA_MISSING_TARGET_ID, QA_USERS } from "../../fixtures/qa/datasets";
import {
  createQaTestHarness,
  QaHarnessAssertionError,
  RealNetworkCallError,
  QA_OUTCOMES,
  reply,
  setupQaTestHarness,
} from "../../helpers/qa-harness";

const restaurantA = getQaDataset("restaurantA");
const userBPrivate = getQaDataset("userBPrivate");

describe("createQaTestHarness", () => {
  it("runs a question through the pipeline and the scripted model", async () => {
    const harness = createQaTestHarness({
      script: [
        {
          name: "pizza",
          when: { questionIncludes: "pizza" },
          then: reply.answered([restaurantA.reviews[0].id], "Crisp crust."),
        },
      ],
    });
    try {
      const result = await harness.ask(restaurantA.target.id, "How is the pizza?");

      expect(result).toMatchObject({
        ok: true,
        answer: {
          outcome: "answered",
          answer: "Crisp crust.",
          citedReviewIds: [restaurantA.reviews[0].id],
          targetId: restaurantA.target.id,
        },
      });
      expect(result.calls).toHaveLength(1);
      expect(result.calls[0]).toMatchObject({
        matchedRule: "pizza",
        question: "How is the pizza?",
      });
    } finally {
      harness.cleanup();
    }
  });

  it("returns pipeline errors instead of throwing them", async () => {
    const harness = createQaTestHarness();
    try {
      const result = await harness.ask(QA_MISSING_TARGET_ID, "Anything?");
      expect(result).toMatchObject({
        ok: false,
        errorName: "TargetNotFoundError",
        errorCode: "TARGET_NOT_FOUND",
        calls: [],
      });
    } finally {
      harness.cleanup();
    }
  });

  it("uses the current actor for ownership, and reset() restores the default actor", async () => {
    const harness = createQaTestHarness({ fallback: reply.insufficientEvidence() });
    try {
      expect(harness.actor).toBe(QA_USERS.userA);
      expect((await harness.ask(userBPrivate.target.id, "q")).ok).toBe(false);

      harness.setActor(QA_USERS.userB);
      expect((await harness.ask(userBPrivate.target.id, "q")).ok).toBe(true);

      harness.reset();
      expect(harness.actor).toBe(QA_USERS.userA);
      expect(harness.model.calls).toHaveLength(0);
    } finally {
      harness.cleanup();
    }
  });

  it("can be limited to some datasets", async () => {
    const harness = createQaTestHarness({ datasets: [restaurantA] });
    try {
      expect(harness.dataset("restaurantA")).toBe(restaurantA);
      expect(() => harness.dataset("targetA")).toThrow("not loaded");
      expect(await harness.ask(getQaDataset("targetA").target.id, "q")).toMatchObject({
        ok: false,
        errorName: "TargetNotFoundError",
      });
    } finally {
      harness.cleanup();
    }
  });

  it("cleanup fails loudly on an unscripted model call, even if the error was swallowed", async () => {
    const harness = createQaTestHarness();
    const result = await harness.ask(restaurantA.target.id, "Unscripted question?");
    expect(result).toMatchObject({ ok: false, errorName: "UnscriptedQaModelCallError" });
    expect(() => harness.cleanup()).toThrow(QaHarnessAssertionError);
    expect(() => harness.cleanup()).not.toThrow();
  });

  it("cleanup fails loudly on any blocked network attempt", async () => {
    const harness = createQaTestHarness();
    await fetch("https://api.openai.com/v1/responses").catch(() => undefined);
    expect(() => harness.cleanup()).toThrow(RealNetworkCallError);
  });

  it("restores the network and environment after cleanup", () => {
    const realFetch = globalThis.fetch;
    const harness = createQaTestHarness();
    expect(globalThis.fetch).not.toBe(realFetch);
    harness.cleanup();
    expect(globalThis.fetch).toBe(realFetch);
  });
});

describe("reference pipeline citation contract (#79 parseQaModelReply)", () => {
  const cited = [restaurantA.reviews[0].id];

  it.each(QA_OUTCOMES.filter((outcome) => outcome !== "answered").map((outcome) => [outcome]))(
    "rejects %s with citations as UNEXPECTED_CITATIONS instead of stripping them",
    async (outcome) => {
      const harness = createQaTestHarness({
        fallback: reply.payload({ outcome, answer: "Not an answer.", citedReviewIds: cited }),
      });
      try {
        expect(await harness.ask(restaurantA.target.id, "Anything?")).toMatchObject({
          ok: false,
          errorName: "QaResponseError",
          errorCode: "UNEXPECTED_CITATIONS",
        });
      } finally {
        harness.cleanup();
      }
    },
  );

  it.each(QA_OUTCOMES.filter((outcome) => outcome !== "answered").map((outcome) => [outcome]))(
    "accepts %s with no citations",
    async (outcome) => {
      const harness = createQaTestHarness({
        fallback: reply.payload({ outcome, answer: "Not an answer.", citedReviewIds: [] }),
      });
      try {
        expect(await harness.ask(restaurantA.target.id, "Anything?")).toMatchObject({
          ok: true,
          answer: { outcome, citedReviewIds: [] },
        });
      } finally {
        harness.cleanup();
      }
    },
  );

  it("keeps citations on an answered reply, deduplicated", async () => {
    const harness = createQaTestHarness({ fallback: reply.answered([...cited, ...cited]) });
    try {
      expect(await harness.ask(restaurantA.target.id, "Anything?")).toMatchObject({
        ok: true,
        answer: { outcome: "answered", citedReviewIds: cited },
      });
    } finally {
      harness.cleanup();
    }
  });
});

describe("setupQaTestHarness", () => {
  const qa = setupQaTestHarness(() => ({
    script: [
      {
        when: { targetId: restaurantA.target.id },
        then: reply.declined("declined_general_knowledge"),
      },
    ],
  }));

  it("provides a fresh harness per test (first test)", async () => {
    expect(qa().model.calls).toHaveLength(0);
    await qa().ask(restaurantA.target.id, "What is the weather today?");
    expect(qa().model.calls).toHaveLength(1);
  });

  it("provides a fresh harness per test (second test)", () => {
    expect(qa().model.calls).toHaveLength(0);
  });
});

describe("setupQaTestHarness outside a test", () => {
  const qa = setupQaTestHarness();
  it("is available inside the test body", () => {
    expect(qa().network.attempts).toEqual([]);
  });
});
