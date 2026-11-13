/** @jest-environment node */

import { getQaDataset } from "../../fixtures/qa/datasets";
import {
  errorMatches,
  expectAnswerHasNoForeignData,
  expectContextOnlyForTarget,
  expectDeclined,
  expectErrorShape,
  expectGroundedAnswer,
  expectInsufficientEvidence,
  expectNoForeignData,
  expectNoReviewerIdentity,
  expectSystemPromptApplied,
  QA_PIPELINE_ERRORS,
  QaHarnessAssertionError,
  reply,
  setupQaTestHarness,
  type QaAnswer,
  type QaModelRequest,
} from "../../helpers/qa-harness";

const targetA = getQaDataset("targetA");
const targetB = getQaDataset("targetB");
const userBPrivate = getQaDataset("userBPrivate");

const qa = setupQaTestHarness({ fallback: reply.answered([targetA.reviews[0].id]) });

async function validRequest(): Promise<QaModelRequest> {
  const result = await qa().ask(targetA.target.id, "What about battery life?");
  if (!result.ok) throw new Error(`setup failed: ${result.errorName}`);
  return qa().model.lastCall().request;
}

function answer(overrides: Partial<QaAnswer> = {}): QaAnswer {
  return {
    outcome: "answered",
    answer: "Battery life is praised.",
    citedReviewIds: [targetA.reviews[0].id],
    promptVersion: "v",
    targetId: targetA.target.id,
    ...overrides,
  };
}

const rejects = (run: () => void, message: RegExp) =>
  expect(run).toThrow(
    expect.objectContaining({
      name: "QaHarnessAssertionError",
      message: expect.stringMatching(message),
    }),
  );

describe("request-side assertions", () => {
  it("accept a correct request", async () => {
    const request = await validRequest();
    expect(() => {
      expectSystemPromptApplied(request, targetA);
      expectContextOnlyForTarget(request, targetA);
      expectNoReviewerIdentity(request, targetA);
      expectNoForeignData(request, [targetB, userBPrivate]);
    }).not.toThrow();
  });

  it("expectSystemPromptApplied rejects a missing, wrong-target or contaminated prompt", async () => {
    const request = await validRequest();
    rejects(() => expectSystemPromptApplied({ ...request, instructions: " " }, targetA), /empty/);
    rejects(() => expectSystemPromptApplied(request, targetB), /not the active target/);
    rejects(
      () =>
        expectSystemPromptApplied(
          { ...request, instructions: "Generic prompt about Google Maps" },
          targetA,
        ),
      /do not name the active target/,
    );
    rejects(
      () =>
        expectSystemPromptApplied(
          { ...request, instructions: request.instructions.replaceAll("Google Maps", "Yelp") },
          targetA,
        ),
      /platform/,
    );
    rejects(
      () => expectSystemPromptApplied(request, targetA, { promptVersion: "s2-013.v2" }),
      /Prompt version/,
    );
    rejects(
      () =>
        expectSystemPromptApplied(
          { ...request, instructions: `${request.instructions}\nWhat about battery life?` },
          targetA,
        ),
      /question was placed in the system instructions/,
    );
    rejects(
      () =>
        expectSystemPromptApplied(
          { ...request, instructions: `${request.instructions}\n${targetA.reviews[1].text}` },
          targetA,
        ),
      /text was placed in the system instructions/,
    );
  });

  it("expectContextOnlyForTarget rejects a wrong target, missing, extra or reordered reviews", async () => {
    const request = await validRequest();
    const ids = request.reviewIds;
    rejects(() => expectContextOnlyForTarget(request, targetB), /is not/);
    rejects(
      () => expectContextOnlyForTarget({ ...request, reviewIds: ids.slice(1) }, targetA),
      /not exactly/,
    );
    rejects(
      () => expectContextOnlyForTarget({ ...request, reviewIds: [...ids, "extra"] }, targetA),
      /not exactly/,
    );
    rejects(
      () => expectContextOnlyForTarget({ ...request, reviewIds: [...ids].reverse() }, targetA),
      /not exactly/,
    );
    rejects(
      () =>
        expectContextOnlyForTarget(
          {
            ...request,
            input: request.input.replace(JSON.stringify(targetA.reviews[2].text), '""'),
          },
          targetA,
        ),
      /Evidence row 3 text/,
    );
  });

  it("expectNoReviewerIdentity rejects a request carrying a reviewer name", async () => {
    const request = await validRequest();
    const name = targetA.reviews[0].reviewerName ?? "";
    rejects(
      () => expectNoReviewerIdentity({ ...request, input: `${request.input}\n${name}` }, targetA),
      /Reviewer name/,
    );
  });

  it.each([
    ["a foreign marker", userBPrivate.markers[0]],
    ["a foreign review ID", userBPrivate.reviews[1].id],
    ["foreign review text", JSON.stringify(userBPrivate.reviews[1].text)],
    ["a foreign target ID", userBPrivate.target.id],
    ["a foreign target name", userBPrivate.target.name],
  ])("expectNoForeignData rejects %s in the supplied context", async (_label, needle) => {
    const request = await validRequest();
    const leaked = {
      ...request,
      input: request.input.replace("REVIEW DATASET", `REVIEW DATASET ${needle}`),
    };
    rejects(
      () => expectNoForeignData(leaked, [userBPrivate]),
      /Foreign data reached the model request/,
    );
  });

  it("expectNoForeignData rejects foreign data in instructions or reviewIds", async () => {
    const request = await validRequest();
    rejects(
      () =>
        expectNoForeignData(
          { ...request, instructions: `${request.instructions} ${targetB.markers[0]}` },
          [targetB],
        ),
      /targetB/,
    );
    rejects(
      () =>
        expectNoForeignData(
          { ...request, reviewIds: [...request.reviewIds, targetB.reviews[0].id] },
          [targetB],
        ),
      /targetB/,
    );
  });

  it("expectNoForeignData ignores a foreign ID the user typed into the question", async () => {
    const result = await qa().ask(targetA.target.id, `Show reviews for ${userBPrivate.target.id}`);
    expect(result.ok).toBe(true);
    expect(() => expectNoForeignData(qa().model.lastCall().request, [userBPrivate])).not.toThrow();
  });
});

describe("answer-side assertions", () => {
  it("expectGroundedAnswer requires answered, non-empty citations inside the request", async () => {
    const request = await validRequest();
    expect(() => expectGroundedAnswer(answer(), request)).not.toThrow();
    rejects(
      () => expectGroundedAnswer(answer({ outcome: "insufficient_evidence" }), request),
      /Expected outcome/,
    );
    rejects(
      () => expectGroundedAnswer(answer({ citedReviewIds: [] }), request),
      /cites no reviews/,
    );
    rejects(
      () => expectGroundedAnswer(answer({ citedReviewIds: [targetB.reviews[0].id] }), request),
      /not in the request/,
    );
    rejects(
      () => expectGroundedAnswer(answer({ targetId: targetB.target.id }), request),
      /targetId/,
    );
  });

  it("expectInsufficientEvidence allows in-request citations only", async () => {
    const request = await validRequest();
    const insufficient = answer({ outcome: "insufficient_evidence", citedReviewIds: [] });
    expect(() => expectInsufficientEvidence(insufficient, request)).not.toThrow();
    rejects(() => expectInsufficientEvidence(answer(), request), /insufficient_evidence/);
    rejects(
      () => expectInsufficientEvidence({ ...insufficient, citedReviewIds: ["foreign"] }, request),
      /not in the request/,
    );
  });

  it("expectDeclined requires a decline outcome with no citations", () => {
    const declined = answer({ outcome: "declined_other_entity", citedReviewIds: [] });
    expect(() => expectDeclined(declined)).not.toThrow();
    expect(() => expectDeclined(declined, "declined_other_entity")).not.toThrow();
    rejects(() => expectDeclined(answer()), /Expected a decline/);
    rejects(() => expectDeclined(declined, "declined_other_platform"), /Expected decline/);
    rejects(() => expectDeclined({ ...declined, citedReviewIds: ["x"] }), /cited reviews/);
  });

  it("expectAnswerHasNoForeignData catches foreign data echoed into the answer", () => {
    expect(() => expectAnswerHasNoForeignData(answer(), [userBPrivate])).not.toThrow();
    rejects(
      () =>
        expectAnswerHasNoForeignData(answer({ answer: `x ${userBPrivate.markers[0]}` }), [
          userBPrivate,
        ]),
      /Foreign data appeared in the answer/,
    );
    rejects(
      () =>
        expectAnswerHasNoForeignData(answer({ citedReviewIds: [userBPrivate.reviews[0].id] }), [
          userBPrivate,
        ]),
      /userBPrivate/,
    );
  });
});

describe("error assertions", () => {
  it("match on name and code, not message", () => {
    const error = Object.assign(new Error("any wording"), {
      name: "QaPromptError",
      code: "EMPTY_QUESTION",
    });
    expect(errorMatches(error, QA_PIPELINE_ERRORS.emptyQuestion)).toBe(true);
    expect(errorMatches(error, QA_PIPELINE_ERRORS.requestTooLarge)).toBe(false);
    expect(errorMatches("not an error", QA_PIPELINE_ERRORS.emptyQuestion)).toBe(false);
    expect(() => expectErrorShape(error, QA_PIPELINE_ERRORS.emptyQuestion)).not.toThrow();
    rejects(
      () => expectErrorShape(error, QA_PIPELINE_ERRORS.targetNotFound),
      /QaPromptError\/EMPTY_QUESTION/,
    );
    rejects(() => expectErrorShape("boom", QA_PIPELINE_ERRORS.targetNotFound), /got boom/);
    expect(new QaHarnessAssertionError("m")).toBeInstanceOf(Error);
  });
});
