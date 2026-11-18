/** @jest-environment node */

import {
  APPROVED_CONFIGURED_MODEL_CASES,
  buildConfiguredModelAttemptPlan,
  CONFIGURED_MODEL_EXTERNAL_REQUEST_LIMIT,
  CONFIGURED_MODEL_LOGICAL_CALL_LIMIT,
} from "../../../fixtures/configured-model-evaluation";

jest.mock("server-only", () => ({}));

describe("approved configured-model evaluation matrix", () => {
  it("selects exactly the approved 12 cases without changing their labels", () => {
    expect(
      APPROVED_CONFIGURED_MODEL_CASES.map(({ story, id, expectedOutcome }) => ({
        story,
        id,
        expectedOutcome,
      })),
    ).toEqual([
      { story: "S2-014", id: "sg-general-001", expectedOutcome: "declined_general_knowledge" },
      { story: "S2-014", id: "sg-general-002", expectedOutcome: "declined_general_knowledge" },
      { story: "S2-014", id: "sg-general-003", expectedOutcome: "declined_general_knowledge" },
      { story: "S2-014", id: "sg-general-004", expectedOutcome: "declined_general_knowledge" },
      { story: "S2-015", id: "sg-other-entity-001", expectedOutcome: "declined_other_entity" },
      { story: "S2-015", id: "sg-other-entity-002", expectedOutcome: "declined_other_entity" },
      { story: "S2-015", id: "sg-other-entity-003", expectedOutcome: "declined_other_entity" },
      { story: "S2-015", id: "sg-other-platform-001", expectedOutcome: "declined_other_platform" },
      { story: "S2-015", id: "sg-other-platform-002", expectedOutcome: "declined_other_platform" },
      { story: "S2-015", id: "sg-other-platform-003", expectedOutcome: "declined_other_platform" },
      {
        story: "S2-015",
        id: "s2-015-mixed-entity-platform",
        expectedOutcome: "declined_other_entity",
      },
      {
        story: "S2-015",
        id: "s2-015-described-other-entity",
        expectedOutcome: "declined_other_entity",
      },
    ]);
  });

  it("plans exactly three repetitions, 36 logical calls, and at most 72 provider requests", () => {
    const plan = buildConfiguredModelAttemptPlan();

    expect(plan).toHaveLength(CONFIGURED_MODEL_LOGICAL_CALL_LIMIT);
    expect(CONFIGURED_MODEL_EXTERNAL_REQUEST_LIMIT).toBe(72);
    for (const evaluationCase of APPROVED_CONFIGURED_MODEL_CASES) {
      expect(
        plan.filter(({ id }) => id === evaluationCase.id).map(({ repetition }) => repetition),
      ).toEqual([1, 2, 3]);
    }
  });

  it("preserves the two approved integration questions verbatim", () => {
    expect(APPROVED_CONFIGURED_MODEL_CASES.slice(-2).map(({ question }) => question)).toEqual([
      "How does Restaurant A compare with Restaurant B based on Amazon reviews?",
      "What do customers think about the place across the street?",
    ]);
  });
});
