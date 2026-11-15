/**
 * S2-003 compile-time alignment between the harness and production Q&A code.
 *
 * Nothing here runs. `npm run typecheck` (tsc over `tests/`) fails if a harness-owned type or
 * error code drifts from production. Only structural types and error-code membership are checked
 * here. Values teammates may bump (`SYSTEM_PROMPT_VERSION`, budgets, outcome lists) are imported
 * at runtime instead and asserted in `tests/unit/qa-harness/contract-alignment.test.ts`.
 */

import type { TargetNotFoundError } from "@/services/analysis-targets/target-ownership";
import type { AuthIdentity } from "@/lib/validation/auth";
import type { QaModelErrorCode } from "@/services/qa/openai-qa-client";
import type { QaInputValidationErrorCode } from "@/services/qa/qa-request";
import type {
  QA_REPLY_JSON_SCHEMA,
  QaAnswer,
  QaResponseErrorCode,
} from "@/services/qa/qa-response";
import type { ReviewContextErrorCode } from "@/services/qa/review-context";
import type { PromptReview, QaPromptError } from "@/services/qa/system-prompt";
import type { QaBudgetError } from "@/services/qa/token-budget";

import type { QA_PIPELINE_ERRORS, QaActor, QaEvidenceRow, QaModelReplyPayload } from "./contract";

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

/** Production error class name → the union of codes it can carry. */
type ProductionErrorCodes = {
  TargetNotFoundError: TargetNotFoundError["code"];
  ReviewContextError: ReviewContextErrorCode;
  QaInputValidationError: QaInputValidationErrorCode;
  QaPromptError: QaPromptError["code"];
  QaBudgetError: QaBudgetError["code"];
  QaResponseError: QaResponseErrorCode;
  QaModelError: QaModelErrorCode;
};

type HarnessErrorEntry = (typeof QA_PIPELINE_ERRORS)[keyof typeof QA_PIPELINE_ERRORS];

/** Entries whose name is not a production error, or whose code that error cannot carry. */
type MisalignedErrors<E> = E extends { name: infer N; code: infer C }
  ? N extends keyof ProductionErrorCodes
    ? C extends ProductionErrorCodes[N]
      ? never
      : E
    : E
  : E;

export type ContractAlignmentChecks = [
  // Every harness error entry names a real error class and one of its real codes.
  Expect<Equal<MisalignedErrors<HarnessErrorEntry>, never>>,
  // The scripted reply payload has exactly the S2-011 structured-output keys...
  Expect<Equal<keyof QaModelReplyPayload, (typeof QA_REPLY_JSON_SCHEMA)["required"][number]>>,
  // ...and the same field types as the validated answer.
  Expect<Equal<QaModelReplyPayload, Pick<QaAnswer, keyof QaModelReplyPayload>>>,
  // An evidence row is exactly the S2-013 projection of a PromptReview.
  Expect<
    Equal<
      QaEvidenceRow,
      {
        id: PromptReview["id"];
        rating: PromptReview["rating"];
        date: PromptReview["reviewDate"];
        text: PromptReview["text"];
      }
    >
  >,
  // A harness actor is a valid verified identity for `getAuthenticatedUser`.
  Expect<QaActor extends AuthIdentity ? true : false>,
];
