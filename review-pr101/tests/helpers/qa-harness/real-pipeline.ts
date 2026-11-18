import { createSupabaseServerClient } from "@/lib/supabase/server";
import { answerQuestion } from "@/services/qa/answer-question";
import { buildReviewDatasetContext } from "@/services/qa/review-context";

import type { QaPipeline, QaReviewContextBuilder } from "./contract";
import type { FakeSupabase } from "./fake-supabase";

/**
 * S2-003 adapter onto the REAL Q&A pipeline:
 *
 *   answerQuestion(targetId, question, { buildReviewDatasetContext, callModel })
 *
 * with the real S2-011 orchestration, the real S2-010 `buildReviewDatasetContext` (real
 * `getAuthenticatedUser`, real ownership guard and repository, real supabase-js queries), the
 * real S2-013 prompt and the real S2-011 reply validation. Only infrastructure is replaced:
 *
 * - `createSupabaseServerClient` (cookies + Next headers) returns a `FakeSupabase` client;
 * - `callModel` is the harness's fake model (or `createOpenAiQaModel` over a fake fetch).
 *
 * SEAM NOTE: the builder and `getAuthenticatedUser` call `createSupabaseServerClient()` directly
 * and take no client factory, so the only way to inject the fake is a Jest module mock. Jest
 * hoists `jest.mock` only inside test files, so each test file carries the preamble below.
 */

export const QA_HARNESS_PREAMBLE = `jest.mock("server-only", () => ({}));
jest.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: jest.fn() }));`;

/** The real orchestration. Pipelines that wrap it may tamper with requests or answers only. */
export const realQaPipeline: QaPipeline = ({
  targetId,
  question,
  buildReviewDatasetContext: builder,
  callModel,
}) => answerQuestion(targetId, question, { buildReviewDatasetContext: builder, callModel });

/** The real S2-010 builder, wrapped only to count calls. It is never replaced. */
export function countingContextBuilder(onCall: () => void): QaReviewContextBuilder {
  return (targetId) => {
    onCall();
    return buildReviewDatasetContext(targetId);
  };
}

/** Routes `createSupabaseServerClient()` to the fake. Throws if the preamble is missing. */
export function bindFakeSupabase(fake: FakeSupabase): () => void {
  if (!jest.isMockFunction(createSupabaseServerClient)) {
    throw new Error(
      "The S2-003 Q&A harness needs `@/lib/supabase/server` mocked. Start the test file with:\n" +
        QA_HARNESS_PREAMBLE,
    );
  }
  const mocked = jest.mocked(createSupabaseServerClient);
  mocked.mockImplementation(
    async () => fake.client() as unknown as Awaited<ReturnType<typeof createSupabaseServerClient>>,
  );
  return () => mocked.mockReset();
}
