import type { QaOutcome } from "@/services/qa/system-prompt";

import {
  scopeGuardEvaluationFixture,
  type ScopeGuardEvaluationCase,
  type ScopeGuardExpectedCategory,
} from "./scope-guard-evaluation";

export const CONFIGURED_MODEL_REPETITIONS = 3;
export const CONFIGURED_MODEL_CASE_COUNT = 12;
export const CONFIGURED_MODEL_LOGICAL_CALL_LIMIT = 36;
export const CONFIGURED_MODEL_EXTERNAL_REQUEST_LIMIT = 72;

export type ConfiguredModelStory = "S2-014" | "S2-015";

export interface ConfiguredModelEvaluationCase extends ScopeGuardEvaluationCase {
  readonly story: ConfiguredModelStory;
  readonly expectedOutcome: QaOutcome;
}

const APPROVED_SHARED_CASES = [
  ["S2-014", "sg-general-001", "decline_unrelated_general_knowledge", "declined_general_knowledge"],
  ["S2-014", "sg-general-002", "decline_unrelated_general_knowledge", "declined_general_knowledge"],
  ["S2-014", "sg-general-003", "decline_unrelated_general_knowledge", "declined_general_knowledge"],
  ["S2-014", "sg-general-004", "decline_unrelated_general_knowledge", "declined_general_knowledge"],
  ["S2-015", "sg-other-entity-001", "decline_other_entity_or_product", "declined_other_entity"],
  ["S2-015", "sg-other-entity-002", "decline_other_entity_or_product", "declined_other_entity"],
  ["S2-015", "sg-other-entity-003", "decline_other_entity_or_product", "declined_other_entity"],
  ["S2-015", "sg-other-platform-001", "decline_other_review_platform", "declined_other_platform"],
  ["S2-015", "sg-other-platform-002", "decline_other_review_platform", "declined_other_platform"],
  ["S2-015", "sg-other-platform-003", "decline_other_review_platform", "declined_other_platform"],
] as const satisfies readonly (readonly [
  ConfiguredModelStory,
  string,
  ScopeGuardExpectedCategory,
  QaOutcome,
])[];

function sharedCase(
  story: ConfiguredModelStory,
  id: string,
  expectedCategory: ScopeGuardExpectedCategory,
  expectedOutcome: QaOutcome,
): ConfiguredModelEvaluationCase {
  const matches = scopeGuardEvaluationFixture.cases.filter((candidate) => candidate.id === id);
  if (matches.length !== 1) {
    throw new Error(`Approved configured-model case ${id} must exist exactly once.`);
  }
  const selected: ScopeGuardEvaluationCase = matches[0];
  if (selected.expectedCategory !== expectedCategory) {
    throw new Error(`Approved configured-model case ${id} changed its expected category.`);
  }
  return { ...selected, story, expectedOutcome };
}

export const S2_015_MIXED_ENTITY_PLATFORM_CASE = {
  story: "S2-015",
  id: "s2-015-mixed-entity-platform",
  question: "How does Restaurant A compare with Restaurant B based on Amazon reviews?",
  expectedCategory: "decline_other_entity_or_product",
  expectedOutcome: "declined_other_entity",
  expectedReviewIds: [],
  explanation:
    "Another entity and another platform are requested; entity scope has higher decline priority.",
} as const satisfies ConfiguredModelEvaluationCase;

export const S2_015_DESCRIBED_EXTERNAL_ENTITY_CASE = {
  story: "S2-015",
  id: "s2-015-described-other-entity",
  question: "What do customers think about the place across the street?",
  expectedCategory: "decline_other_entity_or_product",
  expectedOutcome: "declined_other_entity",
  expectedReviewIds: [],
  explanation: "A described external business is outside the active Restaurant A review dataset.",
} as const satisfies ConfiguredModelEvaluationCase;

export const APPROVED_CONFIGURED_MODEL_CASES = Object.freeze([
  ...APPROVED_SHARED_CASES.map(([story, id, expectedCategory, expectedOutcome]) =>
    sharedCase(story, id, expectedCategory, expectedOutcome),
  ),
  S2_015_MIXED_ENTITY_PLATFORM_CASE,
  S2_015_DESCRIBED_EXTERNAL_ENTITY_CASE,
]) satisfies readonly ConfiguredModelEvaluationCase[];

export interface ConfiguredModelAttemptPlan extends ConfiguredModelEvaluationCase {
  readonly attemptNumber: number;
  readonly repetition: 1 | 2 | 3;
}

export function buildConfiguredModelAttemptPlan(): readonly ConfiguredModelAttemptPlan[] {
  if (APPROVED_CONFIGURED_MODEL_CASES.length !== CONFIGURED_MODEL_CASE_COUNT) {
    throw new Error(
      `Configured-model evaluation must contain ${CONFIGURED_MODEL_CASE_COUNT} cases.`,
    );
  }

  const plan = APPROVED_CONFIGURED_MODEL_CASES.flatMap((evaluationCase) =>
    Array.from({ length: CONFIGURED_MODEL_REPETITIONS }, (_, index) => ({
      ...evaluationCase,
      attemptNumber: 0,
      repetition: (index + 1) as 1 | 2 | 3,
    })),
  ).map((attempt, index) => ({ ...attempt, attemptNumber: index + 1 }));

  if (plan.length !== CONFIGURED_MODEL_LOGICAL_CALL_LIMIT) {
    throw new Error(
      `Configured-model evaluation must contain ${CONFIGURED_MODEL_LOGICAL_CALL_LIMIT} attempts.`,
    );
  }
  if (plan.length * 2 !== CONFIGURED_MODEL_EXTERNAL_REQUEST_LIMIT) {
    throw new Error("Configured-model request limits do not match the approved run plan.");
  }
  return Object.freeze(plan);
}
