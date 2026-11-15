/** @jest-environment node */
jest.mock("server-only", () => ({}));
jest.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: jest.fn() }));

import { createOpenAiQaModel } from "@/services/qa/openai-qa-client";
import { getQaDataset, QA_USERS } from "../../fixtures/qa/datasets";
import {
  createFakeOpenAiFetch,
  FAKE_OPENAI_ENV,
  realQaPipeline,
  extractQuestion,
  setupQaTestHarness,
} from "../../helpers/qa-harness";

const a = getQaDataset("targetA");
const b = getQaDataset("targetB");
const privateB = getQaDataset("userBPrivate");
let provider = createFakeOpenAiFetch();
let delay: ((body: Record<string, unknown>) => Promise<void>) | undefined;
const qa = setupQaTestHarness(() => {
  provider = createFakeOpenAiFetch();
  const fetcher: typeof fetch = async (url, init) => {
    const response = await provider.fetcher(url, init);
    if (String(url).endsWith("/responses")) await delay?.(JSON.parse(String(init?.body)));
    return response;
  };
  const callModel = createOpenAiQaModel({ fetcher, env: FAKE_OPENAI_ENV });
  return { pipeline: (input) => realQaPipeline({ ...input, callModel }) };
});
beforeEach(() => {
  delay = undefined;
});

function assertLastBodies(
  active: typeof a,
  question: string,
  earlierQuestions: readonly string[] = [],
) {
  const count = provider.countCalls().at(-1)!.body;
  const generation = provider.generationCalls().at(-1)!.body;
  expect(count).toEqual({
    model: generation.model,
    instructions: generation.instructions,
    input: generation.input,
    text: generation.text,
  });
  for (const body of [count, generation]) {
    expect(extractQuestion(String(body.input))).toBe(question);
    for (const earlier of earlierQuestions) expect(JSON.stringify(body)).not.toContain(earlier);
  }
  const rows = JSON.parse(String(generation.input).split("\n")[1]);
  expect(rows).toEqual(
    active.reviews.map((r) => ({ id: r.id, text: r.text, rating: r.rating, date: r.reviewDate })),
  );
  for (const other of [a, b, privateB].filter((d) => d !== active)) {
    for (const r of other.reviews) {
      expect(JSON.stringify([count, generation])).not.toContain(r.id);
      expect(JSON.stringify([count, generation])).not.toContain(r.text);
    }
  }
  expect(generation.store).toBe(false);
  expect(generation).not.toHaveProperty("previous_response_id");
  expect(generation).not.toHaveProperty("conversation");
}

it("uses fresh active-target evidence on A -> B -> A and then a different authenticated account", async () => {
  const steps = [
    [a, "S2_019_A_FIRST: What do reviewers say about battery life?"],
    [b, "S2_019_B_SECOND: What do reviewers say about customer service?"],
    [a, "S2_019_A_RETURN: Which battery details are mentioned?"],
    [privateB, "S2_019_OTHER_ACCOUNT: Summarize this account's saved reviews."],
  ] as const;
  const earlier: string[] = [];
  for (const [dataset, question] of steps) {
    if (dataset === privateB) qa().setActor(QA_USERS.userB);
    expect((await qa().ask(dataset.target.id, question)).ok).toBe(true);
    assertLastBodies(dataset, question, earlier);
    earlier.push(question);
  }
});

it("isolates overlapping requests that complete in the opposite order across users", async () => {
  let release!: () => void;
  let entered!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const waiting = new Promise<void>((resolve) => {
    entered = resolve;
  });
  delay = async (body) => {
    if (String(body.input).includes(a.reviews[0].id)) {
      entered();
      await gate;
    }
  };
  const old = qa().ask(a.target.id, "Old question");
  await waiting;
  qa().setActor(QA_USERS.userB);
  const current = await qa().ask(privateB.target.id, "Current question");
  expect(current.ok).toBe(true);
  assertLastBodies(privateB, "Current question", ["Old question"]);
  release();
  expect((await old).ok).toBe(true);
  expect((await qa().ask(privateB.target.id, "Next question")).ok).toBe(true);
  assertLastBodies(privateB, "Next question", ["Old question", "Current question"]);
  expect(provider.generationCalls()).toHaveLength(3);
});

it("does not reuse previous evidence after logout, account change, deletion or ownership revocation", async () => {
  expect((await qa().ask(a.target.id, "q")).ok).toBe(true);
  const before = provider.calls.length;
  qa().setActor(null);
  expect(await qa().ask(a.target.id, "q")).toMatchObject({ ok: false, errorCode: "AUTH_REQUIRED" });
  qa().setActor(QA_USERS.userB);
  expect(await qa().ask(a.target.id, "q")).toMatchObject({
    ok: false,
    errorCode: "TARGET_NOT_FOUND",
  });
  qa().setActor(QA_USERS.userA);
  qa().supabase.tables.reviews = qa().supabase.tables.reviews.filter(
    (r) => r.analysis_target_id !== a.target.id,
  );
  expect(await qa().ask(a.target.id, "q")).toMatchObject({
    ok: false,
    errorCode: "NO_REVIEW_DATA",
  });
  qa().supabase.tables.analysis_targets.find((r) => r.id === b.target.id)!.owner_id =
    QA_USERS.userB.id;
  expect(await qa().ask(b.target.id, "q")).toMatchObject({
    ok: false,
    errorCode: "TARGET_NOT_FOUND",
  });
  expect(provider.calls).toHaveLength(before);
});
