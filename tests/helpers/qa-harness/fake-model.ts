import {
  QA_INPUT_QUESTION_HEADER,
  type QaModelCaller,
  type QaModelReply,
  type QaModelReplyPayload,
  type QaModelRequest,
  type QaOutcome,
} from "./contract";

/**
 * S2-003 deterministic fake for the Q&A model seam (`QaModelCaller`).
 *
 * - Scripted: replies come from ordered rules matched on the request, never from a model.
 * - Recorded: every call is captured (deep-copied) with its outcome for assertions.
 * - Loud: an unscripted call throws `UnscriptedQaModelCallError` unless a fallback is configured.
 * - Offline: it never performs I/O. Delays use `setTimeout`, so Jest fake timers control them.
 */

/** A provider-style failure. `name` matches the real S2-011 `QaModelError` so golden cases agree. */
export class FakeQaModelError extends Error {
  constructor(
    readonly code: string,
    message = `Fake model failure: ${code}`,
  ) {
    super(message);
    this.name = "QaModelError";
  }
}

/** Thrown when the code under test calls the model and no rule or fallback matches. */
export class UnscriptedQaModelCallError extends Error {
  constructor(question: string | undefined, targetId: string) {
    super(
      `Unscripted Q&A model call (targetId=${targetId}, question=${JSON.stringify(question)}). ` +
        "Add a script rule or a fallback to the test harness.",
    );
    this.name = "UnscriptedQaModelCallError";
  }
}

export interface QaReplyContext {
  /** Zero-based index of this call within the fake's log. */
  readonly callIndex: number;
  /** Question parsed from `request.input`, if the S2-013 layout is present. */
  readonly question: string | undefined;
}

export type QaReplySpec =
  | { readonly kind: "payload"; readonly payload: QaModelReplyPayload; readonly delayMs?: number }
  | { readonly kind: "raw"; readonly text: string; readonly delayMs?: number }
  | { readonly kind: "error"; readonly createError: () => Error; readonly delayMs?: number }
  | {
      readonly kind: "dynamic";
      readonly respond: (request: QaModelRequest, context: QaReplyContext) => QaReplySpec;
    };

/** All listed fields must match. An empty matcher matches every request. */
export interface QaRequestMatcher {
  /** Exact question after trimming. */
  readonly question?: string;
  /** Case-insensitive substring of the question. */
  readonly questionIncludes?: string;
  readonly targetId?: string;
  readonly predicate?: (request: QaModelRequest) => boolean;
}

export interface QaScriptRule {
  /** Shown in the call log, for readable failures. */
  readonly name?: string;
  readonly when: QaRequestMatcher;
  readonly then: QaReplySpec;
  /** Stop matching after this many uses (default: unlimited). */
  readonly times?: number;
}

export type QaCallOutcome =
  | { readonly kind: "reply"; readonly reply: QaModelReply }
  | { readonly kind: "error"; readonly name: string; readonly code: string | undefined };

export interface RecordedQaModelCall {
  readonly index: number;
  /** Deep copy of what the code under test sent; later mutation by the caller cannot change it. */
  readonly request: Readonly<QaModelRequest>;
  readonly question: string | undefined;
  /** Name of the matched rule, `"fallback"`, or `undefined` when the call was unscripted. */
  matchedRule: string | undefined;
  /** Set once the call settles. */
  outcome: QaCallOutcome | undefined;
}

export interface FakeQaModelOptions {
  readonly rules?: readonly QaScriptRule[];
  /** Reply for requests no rule matches. Default `"fail"`: throw `UnscriptedQaModelCallError`. */
  readonly fallback?: QaReplySpec | "fail";
}

export interface FakeQaModel {
  /** Pass this wherever the app takes a `QaModelCaller`. */
  readonly callModel: QaModelCaller;
  readonly calls: readonly RecordedQaModelCall[];
  lastCall(): RecordedQaModelCall;
  /** Appends rules after the existing ones. */
  addRules(rules: readonly QaScriptRule[]): void;
  /** Clears the call log and rule usage counts; keeps the rules and fallback. */
  reset(): void;
}

/** Reads the question back out of an S2-013-formatted `input`. Returns undefined if absent. */
export function extractQuestion(input: string): string | undefined {
  const marker = `\n${QA_INPUT_QUESTION_HEADER}\n`;
  const start = input.lastIndexOf(marker);
  if (start === -1) return undefined;
  try {
    const parsed: unknown = JSON.parse(input.slice(start + marker.length));
    return typeof parsed === "string" ? parsed : undefined;
  } catch {
    return undefined;
  }
}

/** The user-turn input with the question block removed: everything the application supplied. */
export function applicationSuppliedInput(request: QaModelRequest): string {
  const index = request.input.lastIndexOf(`\n${QA_INPUT_QUESTION_HEADER}\n`);
  return index === -1 ? request.input : request.input.slice(0, index);
}

function matches(matcher: QaRequestMatcher, request: QaModelRequest, question?: string): boolean {
  if (matcher.question !== undefined && question?.trim() !== matcher.question.trim()) return false;
  if (
    matcher.questionIncludes !== undefined &&
    !question?.toLowerCase().includes(matcher.questionIncludes.toLowerCase())
  ) {
    return false;
  }
  if (matcher.targetId !== undefined && request.targetId !== matcher.targetId) return false;
  if (matcher.predicate !== undefined && !matcher.predicate(request)) return false;
  return true;
}

function errorCode(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "code" in error) {
    return typeof error.code === "string" ? error.code : undefined;
  }
  return undefined;
}

function wait(ms: number | undefined): Promise<void> {
  if (!ms) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function produce(
  spec: QaReplySpec,
  request: QaModelRequest,
  context: QaReplyContext,
): Promise<QaModelReply> {
  if (spec.kind === "dynamic") return produce(spec.respond(request, context), request, context);
  await wait(spec.delayMs);
  if (spec.kind === "error") throw spec.createError();
  return { text: spec.kind === "raw" ? spec.text : JSON.stringify(spec.payload) };
}

export function createFakeQaModel(options: FakeQaModelOptions = {}): FakeQaModel {
  const rules: QaScriptRule[] = [...(options.rules ?? [])];
  const fallback = options.fallback ?? "fail";
  const uses = new Map<QaScriptRule, number>();
  const calls: RecordedQaModelCall[] = [];

  const callModel: QaModelCaller = async (request) => {
    const snapshot = structuredClone(request);
    const question = extractQuestion(snapshot.input);
    const rule = rules.find(
      (candidate) =>
        (candidate.times === undefined || (uses.get(candidate) ?? 0) < candidate.times) &&
        matches(candidate.when, snapshot, question),
    );
    const record: RecordedQaModelCall = {
      index: calls.length,
      request: snapshot,
      question,
      matchedRule: rule ? (rule.name ?? `rule#${rules.indexOf(rule)}`) : undefined,
      outcome: undefined,
    };
    calls.push(record);

    let spec: QaReplySpec;
    if (rule) {
      uses.set(rule, (uses.get(rule) ?? 0) + 1);
      spec = rule.then;
    } else if (fallback !== "fail") {
      record.matchedRule = "fallback";
      spec = fallback;
    } else {
      const error = new UnscriptedQaModelCallError(question, snapshot.targetId);
      record.outcome = { kind: "error", name: error.name, code: undefined };
      throw error;
    }

    try {
      const reply = await produce(spec, snapshot, { callIndex: record.index, question });
      record.outcome = { kind: "reply", reply: structuredClone(reply) };
      return reply;
    } catch (error) {
      record.outcome = {
        kind: "error",
        name: error instanceof Error ? error.name : "UnknownError",
        code: errorCode(error),
      };
      throw error;
    }
  };

  return {
    callModel,
    calls,
    lastCall() {
      const last = calls.at(-1);
      if (!last) throw new Error("The fake Q&A model has not been called.");
      return last;
    },
    addRules(more) {
      rules.push(...more);
    },
    reset() {
      calls.length = 0;
      uses.clear();
    },
  };
}

/**
 * Reply builders. Prefer these over hand-written specs so scripts read as behaviour:
 * `reply.answered(["r1"])`, `reply.declined("declined_other_entity")`, `reply.timeout()`.
 */
export const reply = {
  payload(payload: QaModelReplyPayload, delayMs?: number): QaReplySpec {
    return { kind: "payload", payload, delayMs };
  },
  answered(citedReviewIds: string[], answer = "Fixture answer grounded in the cited reviews.") {
    return reply.payload({ outcome: "answered", answer, citedReviewIds });
  },
  /** Pass citations only to script a contradictory reply; #79 rejects it (UNEXPECTED_CITATIONS). */
  insufficientEvidence(
    citedReviewIds: string[] = [],
    answer = "The reviews do not contain enough information to answer that.",
  ) {
    return reply.payload({ outcome: "insufficient_evidence", answer, citedReviewIds });
  },
  declined(
    outcome: Exclude<QaOutcome, "answered" | "insufficient_evidence">,
    answer = "I can only analyze the reviews for the active target.",
  ) {
    return reply.payload({ outcome, answer, citedReviewIds: [] });
  },
  /** Exact model text, e.g. malformed JSON or prose with no JSON at all. */
  raw(text: string, delayMs?: number): QaReplySpec {
    return { kind: "raw", text, delayMs };
  },
  empty(): QaReplySpec {
    return reply.raw("");
  },
  error(createError: () => Error, delayMs?: number): QaReplySpec {
    return { kind: "error", createError, delayMs };
  },
  providerError(code: string, delayMs?: number): QaReplySpec {
    return reply.error(() => new FakeQaModelError(code), delayMs);
  },
  /** Rejects with `QaModelError`/`MODEL_TIMEOUT` after `ms` (use Jest fake timers to advance). */
  timeout(ms = 30_000): QaReplySpec {
    return reply.providerError("MODEL_TIMEOUT", ms);
  },
  dynamic(respond: (request: QaModelRequest, context: QaReplyContext) => QaReplySpec) {
    return { kind: "dynamic", respond } satisfies QaReplySpec;
  },
  /**
   * Adversarial echo: answers with everything the application supplied (instructions plus review
   * dataset, but not the user's own question) and cites every supplied review. If any foreign
   * data reached the model, it is now in the answer too (S2-016 output check).
   */
  echoContext(): QaReplySpec {
    return reply.dynamic((request) =>
      reply.answered(
        [...request.reviewIds],
        `ECHO ${request.instructions}\n${applicationSuppliedInput(request)}`,
      ),
    );
  },
};
