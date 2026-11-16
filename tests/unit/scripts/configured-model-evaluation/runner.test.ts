/** @jest-environment node */

import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  renderIssueReports,
  type HumanAssessment,
} from "../../../../scripts/configured-model-evaluation/artifacts";
import {
  APPROVED_QA_MODEL,
  EvaluationGuardError,
  RequestLedger,
  runConfiguredModelEvaluation,
  validatePaidExecution,
} from "../../../../scripts/configured-model-evaluation/runner";
import { OPENAI_INPUT_TOKENS_URL, OPENAI_RESPONSES_URL } from "@/services/qa/openai-qa-client";

jest.mock("server-only", () => ({}));

describe("configured-model evaluation runner", () => {
  const temporaryRoots: string[] = [];

  async function temporaryRoot(): Promise<string> {
    const root = await mkdtemp(path.join(tmpdir(), "reviewlens-configured-model-eval-"));
    temporaryRoots.push(root);
    return root;
  }

  afterEach(async () => {
    await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true })));
  });

  it("runs the default offline path through all 36 real pipelines with zero external requests", async () => {
    const outputRoot = await temporaryRoot();
    const result = await runConfiguredModelEvaluation({
      mode: "offline",
      runId: "offline-test",
      outputRoot,
    });

    expect(result).toMatchObject({
      completed: true,
      completedAttempts: 36,
      externalRequests: 0,
      failure: null,
    });
    const manifest = JSON.parse(
      await readFile(path.join(result.artifactDirectory, "manifest.json"), "utf8"),
    ) as Record<string, unknown>;
    expect(manifest).toMatchObject({
      mode: "offline",
      status: "completed",
      modelId: APPROVED_QA_MODEL,
      promptVersion: "s2-013.v4",
      plannedLogicalCalls: 36,
      externalRequestLimit: 72,
      completedAttempts: 36,
      externalRequestsMade: 0,
    });
    const events = (
      await readFile(path.join(result.artifactDirectory, "attempt-events.jsonl"), "utf8")
    )
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(events).toHaveLength(72);
    const completed = events.filter(({ status }) => status === "completed");
    expect(completed).toHaveLength(36);
    expect(completed).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "sg-general-001",
          repetition: 1,
          countedInputTokens: 1_000,
          requestCounts: { tokenCount: 1, generation: 1, external: 0 },
          structuredOutcomeMatchesExpected: true,
        }),
      ]),
    );
    expect(completed.every(({ rawModelReplyText }) => typeof rawModelReplyText === "string")).toBe(
      true,
    );
  });

  it("rejects provider request 73 before it reaches the transport", async () => {
    const transportCalls: string[] = [];
    const ledger = new RequestLedger(async (input) => {
      transportCalls.push(String(input));
      return Response.json({ ok: true });
    }, false);

    for (let attempt = 0; attempt < 36; attempt += 1) {
      ledger.beginAttempt();
      await ledger.fetcher(OPENAI_INPUT_TOKENS_URL);
      await ledger.fetcher(OPENAI_RESPONSES_URL);
      expect(ledger.finishAttempt()).toMatchObject({ tokenCount: 1, generation: 1 });
    }

    expect(transportCalls).toHaveLength(72);
    ledger.beginAttempt();
    await expect(ledger.fetcher(OPENAI_INPUT_TOKENS_URL)).rejects.toMatchObject({
      name: "EvaluationGuardError",
      code: "RUN_REQUEST_LIMIT",
    });
    expect(transportCalls).toHaveLength(72);
  });

  it("rejects a second token-count request in one attempt before transport dispatch", async () => {
    const transportCalls: string[] = [];
    const ledger = new RequestLedger(async (input) => {
      transportCalls.push(String(input));
      return Response.json({ ok: true });
    }, false);

    ledger.beginAttempt();
    await ledger.fetcher(OPENAI_INPUT_TOKENS_URL);
    await expect(ledger.fetcher(OPENAI_INPUT_TOKENS_URL)).rejects.toMatchObject({
      name: "EvaluationGuardError",
      code: "PER_ATTEMPT_REQUEST_LIMIT",
    });
    expect(transportCalls).toEqual([OPENAI_INPUT_TOKENS_URL]);
  });

  it("rejects a second generation request in one attempt before transport dispatch", async () => {
    const transportCalls: string[] = [];
    const ledger = new RequestLedger(async (input) => {
      transportCalls.push(String(input));
      return Response.json({ ok: true });
    }, false);

    ledger.beginAttempt();
    await ledger.fetcher(OPENAI_INPUT_TOKENS_URL);
    await ledger.fetcher(OPENAI_RESPONSES_URL);
    await expect(ledger.fetcher(OPENAI_RESPONSES_URL)).rejects.toMatchObject({
      name: "EvaluationGuardError",
      code: "PER_ATTEMPT_REQUEST_LIMIT",
    });
    expect(transportCalls).toEqual([OPENAI_INPUT_TOKENS_URL, OPENAI_RESPONSES_URL]);
  });

  it("fails closed unless every paid-execution guard is present and exact", () => {
    const validEnv = {
      QA_ENABLED: "true",
      OPENAI_QA_MODEL: APPROVED_QA_MODEL,
      OPENAI_API_KEY: "test-only-not-live",
    };

    expect(() =>
      validatePaidExecution({
        executePaid: false,
        authorizationConfirmed: false,
        runId: "authorized-run",
        env: validEnv,
      }),
    ).toThrow(expect.objectContaining({ code: "PAID_OPT_IN_REQUIRED" }));
    expect(() =>
      validatePaidExecution({
        executePaid: true,
        authorizationConfirmed: true,
        runId: "authorized-run",
        env: { ...validEnv, QA_ENABLED: "false" },
      }),
    ).toThrow(expect.objectContaining({ code: "QA_DISABLED" }));
    expect(() =>
      validatePaidExecution({
        executePaid: true,
        authorizationConfirmed: true,
        runId: "authorized-run",
        env: { ...validEnv, OPENAI_QA_MODEL: "another-model" },
      }),
    ).toThrow(expect.objectContaining({ code: "UNAPPROVED_MODEL" }));
    expect(() =>
      validatePaidExecution({
        executePaid: true,
        authorizationConfirmed: true,
        runId: undefined,
        env: validEnv,
      }),
    ).toThrow(expect.objectContaining({ code: "PAID_RUN_ID_REQUIRED" }));
    expect(
      validatePaidExecution({
        executePaid: true,
        authorizationConfirmed: true,
        runId: "authorized-run",
        env: validEnv,
      }),
    ).toMatchObject(validEnv);
  });

  it.each([
    ["executePaid without authorizationConfirmed", true, false],
    ["authorizationConfirmed without executePaid", false, true],
  ])(
    "rejects %s before artifact creation or transport dispatch",
    async (_caseName, executePaid, authorizationConfirmed) => {
      const outputRoot = await temporaryRoot();
      const transportCalls: string[] = [];

      await expect(
        runConfiguredModelEvaluation({
          mode: "paid",
          runId: "incomplete-paid-opt-in",
          outputRoot,
          executePaid,
          authorizationConfirmed,
          env: {
            QA_ENABLED: "true",
            OPENAI_QA_MODEL: APPROVED_QA_MODEL,
            OPENAI_API_KEY: "test-only-not-live",
          },
          transportOverride: {
            fetcher: async (input) => {
              transportCalls.push(String(input));
              return Response.json({ ok: true });
            },
            external: false,
          },
        }),
      ).rejects.toMatchObject({
        name: "EvaluationGuardError",
        code: "PAID_OPT_IN_REQUIRED",
      });
      expect(transportCalls).toEqual([]);
      expect(await readdir(outputRoot)).toEqual([]);
    },
  );

  it("stops on the first token-count failure, makes no generation request, and preserves artifacts", async () => {
    const outputRoot = await temporaryRoot();
    const calls: string[] = [];
    const failingFetcher: typeof fetch = async (input) => {
      calls.push(String(input));
      return new Response("provider failure", { status: 500 });
    };

    const result = await runConfiguredModelEvaluation({
      mode: "offline",
      runId: "stop-on-count-failure",
      outputRoot,
      transportOverride: { fetcher: failingFetcher, external: false },
    });

    expect(result).toMatchObject({
      completed: false,
      completedAttempts: 0,
      externalRequests: 0,
      failure: { stage: "token_count", name: "QaModelError", code: "MODEL_UNAVAILABLE" },
    });
    expect(calls).toEqual(["https://api.openai.com/v1/responses/input_tokens"]);
    const events = (
      await readFile(path.join(result.artifactDirectory, "attempt-events.jsonl"), "utf8")
    )
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(events).toHaveLength(2);
    expect(events[1]).toMatchObject({
      status: "failed",
      requestCounts: { tokenCount: 1, generation: 0, external: 0 },
    });
  });

  it("stops after the first production-validation failure without retrying either request", async () => {
    const outputRoot = await temporaryRoot();
    const calls: string[] = [];
    const invalidReplyFetcher: typeof fetch = async (input) => {
      const url = String(input);
      calls.push(url);
      if (url.endsWith("/input_tokens")) {
        return Response.json({ object: "response.input_tokens", input_tokens: 1_000 });
      }
      return Response.json({
        status: "completed",
        output: [{ type: "message", content: [{ type: "output_text", text: "not JSON" }] }],
        usage: { input_tokens: 1_000, output_tokens: 2 },
      });
    };

    const result = await runConfiguredModelEvaluation({
      mode: "offline",
      runId: "stop-on-validation-failure",
      outputRoot,
      transportOverride: { fetcher: invalidReplyFetcher, external: false },
    });

    expect(result).toMatchObject({
      completed: false,
      completedAttempts: 0,
      failure: {
        stage: "validation",
        name: "QaResponseError",
        code: "INVALID_MODEL_RESPONSE",
      },
    });
    expect(calls).toEqual([
      "https://api.openai.com/v1/responses/input_tokens",
      "https://api.openai.com/v1/responses",
    ]);
    const events = (
      await readFile(path.join(result.artifactDirectory, "attempt-events.jsonl"), "utf8")
    )
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(events).toHaveLength(2);
    expect(events[1]).toMatchObject({
      status: "failed",
      rawModelReplyText: "not JSON",
      requestCounts: { tokenCount: 1, generation: 1, external: 0 },
    });
  });

  it("does not infer human semantic passes and renders reports only after all entries are assessed", async () => {
    const outputRoot = await temporaryRoot();
    const result = await runConfiguredModelEvaluation({
      mode: "offline",
      runId: "human-review",
      outputRoot,
    });
    const assessmentPath = path.join(result.artifactDirectory, "human-assessment.json");
    const blank = JSON.parse(await readFile(assessmentPath, "utf8")) as HumanAssessment[];
    expect(blank).toHaveLength(36);
    expect(blank.every(({ overallPass }) => overallPass === null)).toBe(true);
    await expect(renderIssueReports(outputRoot, "human-review")).rejects.toThrow(
      /not fully assessed/,
    );

    const assessed = blank.map((entry) => ({
      ...entry,
      structuredOutcomeMatchesExpected: true,
      clearlyDeclinedOutOfScopeRequest: true,
      clearlyIdentifiesActiveTarget: true,
      distinguishesGoogleMapsFromUnsupportedPlatforms: "not_applicable" as const,
      citationsAreEmpty: true,
      makesUnsupportedExternalClaims: false,
      fabricatesComparisonOrExternalEvidence: false,
      overallPass: true,
      reviewerNotes: "Human-reviewed test fixture.",
    }));
    await writeFile(assessmentPath, `${JSON.stringify(assessed, null, 2)}\n`, "utf8");
    const reports = await renderIssueReports(outputRoot, "human-review");

    expect(reports.map((report) => path.basename(report))).toEqual([
      "issue-65-report.md",
      "issue-66-report.md",
    ]);
    expect(await readFile(reports[0], "utf8")).toContain("12/12 passed");
    expect(await readFile(reports[1], "utf8")).toContain("24/24 passed");
  });

  it("uses a dedicated guard error type for safeguard failures", () => {
    expect(new EvaluationGuardError("TEST_GUARD", "guarded")).toMatchObject({
      name: "EvaluationGuardError",
      code: "TEST_GUARD",
    });
  });
});
