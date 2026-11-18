import "server-only";
import { createIngestionAdminClient } from "@/lib/supabase/ingestion-admin";
import { createIngestionAttemptWriter } from "./ingestion-attempt-repository";
import { ingestionRecoveryUrl } from "./ingestion-recovery";

export function ingestionStorageApproved() {
  return (
    process.env.PROVIDER_REVIEW_STORAGE_APPROVED === "true" &&
    !!process.env.PROVIDER_REVIEW_STORAGE_APPROVAL_REFERENCE?.trim()
  );
}
export function ingestionEnabled() {
  return process.env.INGESTION_ENABLED === "true";
}
export function ingestionDependencies() {
  return {
    writer: createIngestionAttemptWriter(createIngestionAdminClient()),
    storageApproved: ingestionStorageApproved(),
    recoveryUrl: ingestionRecoveryUrl,
  };
}
