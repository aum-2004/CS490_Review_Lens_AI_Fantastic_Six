/** @jest-environment node */

// S2-003 harness preamble: the real Q&A pipeline imports `server-only` modules, and the fake
// Supabase is injected through this module mock (the context builder has no client seam).
jest.mock("server-only", () => ({}));
jest.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: jest.fn() }));

import { createSupabaseServerClient } from "@/lib/supabase/server";

import { getQaDataset } from "../../fixtures/qa/datasets";
import { QA_GOLDEN_CASES, type QaGoldenCase } from "../../fixtures/qa/golden-cases";
import {
  answeredFromRequest,
  claimReply,
  realQaPipeline,
  runGoldenCase,
  type QaModelRequest,
  type QaPipeline,
} from "../../helpers/qa-harness";

/**
 * Runs every golden case through the REAL `answerQuestion` with the REAL S2-010
 * `buildReviewDatasetContext`, over a fake Supabase client and a fake verified session. Only the
 * model reply is scripted.
 */
describe("golden Q&A cases (real answerQuestion + real context builder)", () => {
  it.each(QA_GOLDEN_CASES.map((goldenCase) => [goldenCase.id, goldenCase] as const))(
    "%s",
    async (_id, goldenCase) => {
      await expect(runGoldenCase(goldenCase)).resolves.toHaveLength(goldenCase.steps.length);
    },
  );
});

/**
 * Mutation checks: each pipeline below wraps the real one and breaks it in one specific way. If
 * the golden runner did not reject it, the harness would be giving false confidence.
 */
describe("golden runner rejects broken pipelines", () => {
  const real = realQaPipeline;
  const byId = (id: string): QaGoldenCase => {
    const found = QA_GOLDEN_CASES.find((goldenCase) => goldenCase.id === id);
    if (!found) throw new Error(`no golden case ${id}`);
    return found;
  };

  /** Wraps the real pipeline, rewriting each request on its way to the model. */
  const tamperRequest =
    (rewrite: (request: QaModelRequest) => QaModelRequest): QaPipeline =>
    (input) =>
      real({ ...input, callModel: (request) => input.callModel(rewrite(request)) });

  /** The pre-#79 behaviour: silently repair a non-answer by dropping its claims (citations). */
  const dropCitationsBeforeValidation: QaPipeline = (input) =>
    real({
      ...input,
      callModel: async (request) => {
        const modelReply = await input.callModel(request);
        const payload = JSON.parse(modelReply.text) as Record<string, unknown>;
        const repaired = payload.outcome === "answered" ? payload : { ...payload, claims: [] };
        return { text: JSON.stringify(repaired) };
      },
    });

  /** A repairing pipeline: silently drops claims with no evidence instead of rejecting the reply. */
  const dropUncitedClaimsBeforeValidation: QaPipeline = (input) =>
    real({
      ...input,
      callModel: async (request) => {
        const modelReply = await input.callModel(request);
        const payload = JSON.parse(modelReply.text) as { claims: { evidence: unknown[] }[] };
        const claims = payload.claims.filter((claim) => claim.evidence.length > 0);
        return { text: JSON.stringify({ ...payload, claims }) };
      },
    });

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
      // The stale Target A ID is foreign to Target B, so the leak check names it first.
      /step 2: Foreign data reached the model request:\n- targetA: "2a000000/,
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
      "corrupts a serialized rating while keeping text and reviewIds",
      "qa-answer-001",
      tamperRequest((request) => ({
        ...request,
        input: request.input.replace('"rating":5', '"rating":1'),
      })),
      /qa-answer-001 step 1: Evidence row 1 rating is 1; expected 5/,
    ],
    [
      "drops the system prompt",
      "qa-general-001",
      tamperRequest((request) => ({ ...request, instructions: "" })),
      /System instructions are empty/,
    ],
    [
      "strips the grounding and decline rules from the system prompt",
      "qa-other-entity-001",
      tamperRequest((request) => ({
        ...request,
        instructions: request.instructions
          .split("\n")
          .filter((line) => !/^\d+\. (Base every answer|Decline )/.test(line))
          .join("\n"),
      })),
      /qa-other-entity-001 step 1: System instructions are missing prompt rules:\n- grounded-in-reviews/,
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
            maxOutputTokens: 0,
          })
          .catch(() => undefined);
        return real(input);
      },
      /called 1 time\(s\); expected none/,
    ],
    [
      "returns ungrounded answers instead of rejecting them",
      "qa-output-invented-citation",
      // Sends a correct request, then returns the model's citations without validating them.
      async (input) => {
        let sent: QaModelRequest | undefined;
        await real({
          ...input,
          callModel: async (request) => {
            sent = request;
            await input.callModel(request);
            return {
              text: claimReply.text(answeredFromRequest(request, [request.reviewIds[0]])),
            };
          },
        });
        if (!sent) throw new Error("the real pipeline did not call the model");
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
      "qa-other-platform-002",
      async (input) => ({
        ...(await real(input)),
        citedReviewIds: [getQaDataset("restaurantA").reviews[0].id],
      }),
      /declined reply carries cited reviews/,
    ],
    [
      "strips citations from a cited decline instead of rejecting it",
      "qa-other-platform-001",
      dropCitationsBeforeValidation,
      /qa-other-platform-001 step 1: Expected unexpectedCitations, but the pipeline answered with "declined_other_platform"/,
    ],
    [
      "strips citations from cited insufficient_evidence instead of rejecting it",
      "qa-output-cited-insufficient",
      dropCitationsBeforeValidation,
      /qa-output-cited-insufficient step 1: Expected unexpectedCitations, but the pipeline answered with "insufficient_evidence"/,
    ],
    [
      "drops an unsupported claim and shows the rest instead of rejecting the reply",
      "qa-claim-mixed-support",
      dropUncitedClaimsBeforeValidation,
      /qa-claim-mixed-support step 1: Expected unsupportedClaim, but the pipeline answered with "answered"/,
    ],
    [
      "leaks a foreign marker into the answer text",
      "qa-answer-001",
      async (input) => {
        const answer = await real(input);
        return { ...answer, answer: `${answer.answer} QA_USER_B_PRIVATE_MARKER` };
      },
      /Foreign data appeared in the answer/,
    ],
    [
      "loads the review context before rejecting an over-long question",
      "qa-edge-long-question",
      async (input) => {
        await input.buildReviewDatasetContext(input.targetId).catch(() => undefined);
        return real(input);
      },
      /qa-edge-long-question step 1: The context builder ran 1 time\(s\) and made 3 Supabase request\(s\); expected none/,
    ],
    [
      "reads a foreign target's reviews before the ownership check denies it",
      "qa-cross-user-001",
      async (input) => {
        const client = await createSupabaseServerClient();
        await client.from("reviews").select("id").eq("analysis_target_id", String(input.targetId));
        return real(input);
      },
      // Step 1 is allowed to read Target A's reviews; step 2 (User B's target) is not.
      /qa-cross-user-001 step 2: Review rows were read 1 time\(s\) before targetNotFound/,
    ],
    [
      "reports a stale prompt version on the answer",
      "qa-answer-001",
      async (input) => ({ ...(await real(input)), promptVersion: "s2-013.stale" }),
      /Answer prompt version s2-013.stale is not/,
    ],
  ])("fails a pipeline that %s", async (_label, caseId, pipeline, message) => {
    await expect(runGoldenCase(byId(caseId), { pipeline })).rejects.toThrow(message);
  });
});
