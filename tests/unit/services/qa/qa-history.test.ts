/** @jest-environment node */

// S3-006: the history service maps database results without leaking details and fails closed.
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  listQaHistory,
  MAX_QA_HISTORY_EXCHANGES,
  QaHistoryError,
  recordQaExchange,
} from "@/services/qa/qa-history";

jest.mock("server-only", () => ({}));

const TARGET = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const REVIEW = "a1a1a1a1-0000-4000-8000-000000000001";
const EXCHANGE = "e0000000-0000-4000-8000-000000000001";

const input = {
  targetId: TARGET,
  question: "What do reviewers like?",
  outcome: "answered" as const,
  answer: "Bread is great.",
  citedReviewIds: [REVIEW],
  promptVersion: "s2-013.v7",
};

function rpcClient(result: { data: unknown; error: unknown }) {
  const rpc = jest.fn().mockResolvedValue(result);
  return { client: { rpc } as unknown as SupabaseClient, rpc };
}

/** A chainable stand-in for `client.from(...).select(...).eq(...).order(...).order(...).limit(...)`. */
function queryClient(result: { data: unknown; error: unknown }) {
  const calls: Array<[string, unknown[]]> = [];
  const chain: Record<string, unknown> = {};
  for (const method of ["select", "eq", "order"]) {
    chain[method] = (...args: unknown[]) => {
      calls.push([method, args]);
      return chain;
    };
  }
  chain.limit = async (...args: unknown[]) => {
    calls.push(["limit", args]);
    return result;
  };
  const from = jest.fn(() => chain);
  return { client: { from } as unknown as SupabaseClient, from, calls };
}

describe("recordQaExchange", () => {
  it("sends the exchange to the ownership-checking RPC and returns its identity", async () => {
    const { client, rpc } = rpcClient({
      data: [{ id: EXCHANGE, created_at: "2026-11-26T00:00:00Z" }],
      error: null,
    });
    await expect(recordQaExchange(client, input)).resolves.toEqual({
      id: EXCHANGE,
      createdAt: "2026-11-26T00:00:00Z",
    });
    expect(rpc).toHaveBeenCalledWith("record_review_qa_exchange", {
      p_target_id: TARGET,
      p_question: "What do reviewers like?",
      p_outcome: "answered",
      p_answer: "Bread is great.",
      p_prompt_version: "s2-013.v7",
      p_cited_review_ids: [REVIEW],
    });
  });

  it("reports a full history separately from other failures", async () => {
    const { client } = rpcClient({
      data: null,
      error: { code: "P0001", message: "QA_HISTORY_FULL" },
    });
    await expect(recordQaExchange(client, input)).rejects.toMatchObject({
      code: "QA_HISTORY_FULL",
    });
  });

  it.each([
    ["a foreign or missing target", { data: null, error: { code: "P0002", message: "x" } }],
    ["invalid citations", { data: null, error: { code: "23514", message: "Invalid citations" } }],
    ["an empty result", { data: [], error: null }],
    ["a malformed row", { data: [{ id: 1, created_at: null }], error: null }],
    ["a non-array result", { data: { id: EXCHANGE }, error: null }],
  ])("fails closed on %s without exposing details", async (_case, result) => {
    const { client } = rpcClient(result);
    const error = await recordQaExchange(client, input).catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(QaHistoryError);
    expect(error).toMatchObject({ code: "QA_HISTORY_UNAVAILABLE" });
    expect((error as Error).message).not.toMatch(/citation|P000|23514|bread/i);
  });
});

describe("listQaHistory", () => {
  const row = {
    id: EXCHANGE,
    question: "What do reviewers like?",
    outcome: "answered",
    answer: "Bread is great.",
    cited_review_ids: [REVIEW],
    created_at: "2026-11-26T00:00:00Z",
  };

  it("reads only the target's history, oldest first, bounded by the cap", async () => {
    const { client, from, calls } = queryClient({ data: [row], error: null });
    await expect(listQaHistory(client, TARGET)).resolves.toEqual([
      {
        id: EXCHANGE,
        question: "What do reviewers like?",
        outcome: "answered",
        answer: "Bread is great.",
        citedReviewIds: [REVIEW],
        createdAt: "2026-11-26T00:00:00Z",
      },
    ]);
    expect(from).toHaveBeenCalledWith("review_qa_exchanges");
    expect(calls).toEqual([
      ["select", ["id, question, outcome, answer, cited_review_ids, created_at"]],
      ["eq", ["analysis_target_id", TARGET]],
      ["order", ["created_at", { ascending: true }]],
      ["order", ["id", { ascending: true }]],
      ["limit", [MAX_QA_HISTORY_EXCHANGES]],
    ]);
  });

  it("returns an empty list for an analysis without history", async () => {
    const { client } = queryClient({ data: [], error: null });
    await expect(listQaHistory(client, TARGET)).resolves.toEqual([]);
  });

  it.each([
    ["a database error", { data: null, error: { message: "boom" } }],
    ["an unknown outcome", { data: [{ ...row, outcome: "declined_other_entity" }], error: null }],
    ["non-string citations", { data: [{ ...row, cited_review_ids: [1] }], error: null }],
    ["a missing timestamp", { data: [{ ...row, created_at: null }], error: null }],
  ])("fails closed on %s", async (_case, result) => {
    const { client } = queryClient(result);
    await expect(listQaHistory(client, TARGET)).rejects.toMatchObject({
      code: "QA_HISTORY_UNAVAILABLE",
    });
  });
});
