/** UI/API summary omits job IDs. Owners can read their bindings through RLS-protected SELECT. */
export type IngestionState = "not_ingested" | "processing" | "succeeded" | "failed";
export type IdentityBasis = "expected_place_id" | "provider_resolved";
export interface IngestionSummary {
  state: IngestionState;
  startedAt: string | null;
  finishedAt: string | null;
  savedCount: number;
  skippedCount: number;
  errorCode: string | null;
  identityBasis: IdentityBasis | null;
  providerBusinessName: string | null;
}
export const NO_INGESTION: IngestionSummary = {
  state: "not_ingested",
  startedAt: null,
  finishedAt: null,
  savedCount: 0,
  skippedCount: 0,
  errorCode: null,
  identityBasis: null,
  providerBusinessName: null,
};

const ERRORS: Record<string, string> = {
  INGESTION_START_LIMIT:
    "Your review collection limit has been reached. Please try again later or contact the project team.",
  INGESTION_RESULT_LIMIT:
    "The review service result exceeds our collection limits. Nothing new was saved. Contact the project team to reconcile this request.",
  RESULT_LOOKUP_UNAVAILABLE:
    "We couldn't check this collection right now. Your existing request is saved. Try checking its status again later.",
  RESULT_WINDOW_EXPIRED:
    "We couldn't complete this collection within four hours. Nothing new was saved. Contact the project team to reconcile it before another request.",
  PROVIDER_REJECTED:
    "The review service rejected this request before collection started. Check the source and try again.",
  PROVIDER_CONFIGURATION_UNAVAILABLE:
    "Review collection is unavailable because the review service account or configuration needs attention. Please try again later or contact the project team.",
  SUBMISSION_NOT_ACCEPTED:
    "The project team confirmed that this request was not accepted. You can try collection again.",
  EXPIRED_JOB_RECONCILED:
    "The project team reconciled the expired request. You can try collection again.",
  JOB_BINDING_PENDING: "Review collection may have started. Check its status before trying again.",
  RECOVERY_NOT_CONFIGURED:
    "Review collection is unavailable while request recovery is being configured. Please try again later.",
  SUBMISSION_UNCERTAIN:
    "We couldn't confirm whether the review service accepted this request. New submissions are blocked to prevent duplicate charges. Contact the project team to reconcile the request.",
  SOURCE_NOT_CONFIGURED:
    "Review collection isn't ready for this source yet. Return to My Targets or try again after source setup is complete.",
  INGESTION_DISABLED: "Review collection is currently unavailable. Please try again later.",
  STORAGE_NOT_APPROVED:
    "Review collection is unavailable while review storage permission is being confirmed. Please try again later.",
  SOURCE_IDENTITY_UNVERIFIED:
    "We couldn't confirm these reviews belong to the saved source. Nothing was saved. Check the source or return to My Targets.",
  PROVIDER_TIMEOUT: "The review service took too long to respond. Please try again.",
  PROVIDER_QUOTA:
    "Review collection is temporarily unavailable because our usage limit was reached. Please try again later.",
  PROVIDER_UNAVAILABLE: "We couldn't reach the review service. Please try again later.",
  NO_REVIEWS: "No usable reviews were found for this source, so nothing was saved.",
  INVALID_SOURCE_URL:
    "We couldn't find reviews at this link. Check that the link opens a Google Maps page.",
  INGESTION_FAILED: "We couldn't collect reviews from this source. Please try again later.",
};
export function ingestionErrorMessage(code: string | null | undefined): string {
  return ERRORS[code ?? ""] ?? ERRORS.INGESTION_FAILED;
}
