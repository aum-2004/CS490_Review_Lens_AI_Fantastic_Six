/** @jest-environment node */

import { allQaDatasets, getQaDataset } from "../../fixtures/qa/datasets";
import { QA_GOLDEN_CASES, type QaGoldenCase } from "../../fixtures/qa/golden-cases";
import {
  createReferencePipeline,
  runGoldenCase,
  type QaModelRequest,
  type QaPipeline,
} from "../../helpers/qa-harness";

/**
 * Runs every golden case through the contract reference pipeline. PR 2 runs the same table
 * against the real `answerActiveTargetQuestion` by passing it as `pipeline`.
 */
describe("golden Q&A cases (contract reference pipeline)", () => {
  it.each(QA_GOLDEN_CASES.map((goldenCase) => [goldenCase.id, goldenCase] as const))(
    "%s",
    async (_id, goldenCase) => {
      await expect(runGoldenCase(goldenCase)).resolves.toHaveLength(goldenCase.steps.length);
    },
  );
});

/**
 * Mutation checks: each pipeline below is broken in one specific way. If the golden runner did
 * not reject it, the harness would be giving false confidence.
 */
describe("golden runner rejects broken pipelines", () => {
  const reference = createReferencePipeline(allQaDatasets());
  const byId = (id: string): QaGoldenCase => {
    const found = QA_GOLDEN_CASES.find((goldenCase) => goldenCase.id === id);
    if (!found) throw new Error(`no golden case ${id}`);
    return found;
  };

  /** Wraps the reference pipeline, rewriting each request on its way to the model. */
  const tamperRequest =
    (rewrite: (request: QaModelRequest) => QaModelRequest): QaPipeline =>
    (input) =>
      reference({ ...input, callModel: (request) => input.callModel(rewrite(request)) });

  const userBReview = getQaDataset("userBPrivate").reviews[0];
  const targetAReview = getQaDataset("targetA").reviews[0];

  it.each<[string, string, QaPipeline, RegExp]>([
    [
      "mixes another user's review into the context",
      "qa-cross-user-001",
      tamperRequest((request) => ({
        ...request,
        input: request.input.replace(
          "[{",
          `[{"id":"${userBReview.id}","text":${JSON.stringify(userBReview.text)}},{`,
        ),
      })),
      /Foreign data reached the model request/,
    ],
    [
      "keeps the previous target's review IDs after a switch",
      "qa-target-switch-001",
      tamperRequest((request) =>
        request.targetId === getQaDataset("targetB").target.id
          ? { ...request, reviewIds: [targetAReview.id, ...request.reviewIds] }
          : request,
      ),
      /step 2: Request reviewIds/,
    ],
    [
      "sends reviewer names to the model",
      "qa-answer-002",
      tamperRequest((request) => ({
        ...request,
        input: `${request.input}\nQA_REVIEWER_NAME_21_01`,
      })),
      /Reviewer name/,
    ],
    [
      "drops the system prompt",
      "qa-general-001",
      tamperRequest((request) => ({ ...request, instructions: "" })),
      /System instructions are empty/,
    ],
    [
      "puts the user question into the system prompt",
      "qa-other-entity-001",
      tamperRequest((request) => ({
        ...request,
        instructions: `${request.instructions}\nWhat do customers think about Restaurant B?`,
      })),
      /question was placed in the system instructions/,
    ],
    [
      "calls the model for an empty question",
      "qa-edge-empty-question",
      async (input) => {
        await input
          .callModel({
            promptVersion: "broken",
            targetId: "x",
            instructions: "x",
            input: "x",
            reviewIds: [],
            estimatedInputTokens: 0,
            maxOutputTokens: 0,
          })
          .catch(() => undefined);
        return reference(input);
      },
      /called 1 time\(s\); expected none/,
    ],
    [
      "returns ungrounded answers instead of rejecting them",
      "qa-output-invented-citation",
      // Sends a correct request, then returns the model's citations without validating them.
      async (input) => {
        let sent: QaModelRequest | undefined;
        await reference({
          ...input,
          callModel: async (request) => {
            sent = request;
            await input.callModel(request);
            return {
              text: JSON.stringify({
                outcome: "answered",
                answer: "ok",
                citedReviewIds: [request.reviewIds[0]],
              }),
            };
          },
        });
        if (!sent) throw new Error("reference pipeline did not call the model");
        return {
          outcome: "answered",
          answer: "made up",
          citedReviewIds: ["00000000-0000-4000-8000-000000009999"],
          promptVersion: sent.promptVersion,
          targetId: sent.targetId,
        };
      },
      /qa-output-invented-citation step 1/,
    ],
    [
      "keeps citations on a decline",
      "qa-other-platform-001",
      async (input) => ({
        ...(await reference(input)),
        citedReviewIds: [getQaDataset("restaurantA").reviews[0].id],
      }),
      /declined reply carries cited reviews/,
    ],
    [
      "leaks a foreign marker into the answer text",
      "qa-answer-001",
      async (input) => {
        const answer = await reference(input);
        return { ...answer, answer: `${answer.answer} QA_USER_B_PRIVATE_MARKER` };
      },
      /Foreign data appeared in the answer/,
    ],
  ])("fails a pipeline that %s", async (_label, caseId, pipeline, message) => {
    await expect(runGoldenCase(byId(caseId), { pipeline })).rejects.toThrow(message);
  });
});
