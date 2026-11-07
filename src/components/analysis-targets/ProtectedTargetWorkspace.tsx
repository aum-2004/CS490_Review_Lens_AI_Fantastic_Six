import Link from "next/link";
import { PageHeader } from "@/components/shared/PageHeader";
import { ErrorState } from "@/components/shared/ErrorState";
import { ErrorAlert } from "@/components/shared/ErrorAlert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { WorkspaceIngestion } from "@/components/ingestion/WorkspaceIngestion";
import { ReviewList } from "@/components/reviews/ReviewList";
import { RetryTargetsButton } from "./RetryTargetsButton";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requirePageUser } from "@/services/auth/access-control";
import type { AnalysisTarget } from "@/services/analysis-targets/analysis-target-repository";
import {
  getOwnedTargetOrThrow,
  TargetNotFoundError,
} from "@/services/analysis-targets/target-ownership";
import { createSupabaseReviewStore } from "@/services/reviews/supabase-review-store";
import type { Review } from "@/services/reviews/review-service";
import {
  getLatestAttempt,
  summarizeAttempt,
} from "@/services/ingestion/ingestion-attempt-repository";
import { ingestionEnabled, ingestionStorageApproved } from "@/services/ingestion/ingestion-runtime";
import { ingestionRecoveryConfigured } from "@/services/ingestion/ingestion-recovery";
import { ingestionErrorMessage, type IngestionSummary } from "@/services/ingestion/ingestion-state";

export async function ProtectedTargetWorkspace({
  params,
}: {
  params: Promise<{ targetId: string }>;
}) {
  const { targetId } = await params;
  // Authenticate on every render, including direct navigation and refresh.
  const user = await requirePageUser(`/analysis-targets/${encodeURIComponent(targetId)}`);
  let target: AnalysisTarget | undefined;
  let unavailable = false;
  let reviews: Review[] | null = null;
  let ingestion: IngestionSummary | null = null;
  try {
    const client = await createSupabaseServerClient();
    target = await getOwnedTargetOrThrow(client, targetId, user.id);
    try {
      ingestion = summarizeAttempt(await getLatestAttempt(client, user.id, target.id));
    } catch {
      console.error("Workspace operation failed", {
        operation: "ingestion-status",
        category: "LOAD_FAILED",
      });
    }
    // Child data is never requested before the parent ownership check succeeds.
    try {
      reviews = await createSupabaseReviewStore(client).listReviews(target.id);
    } catch {
      console.error("Workspace operation failed", {
        operation: "reviews",
        category: "LOAD_FAILED",
      });
    }
  } catch (error) {
    unavailable = error instanceof TargetNotFoundError;
    console.error("Workspace operation failed", {
      operation: "target",
      category: unavailable ? "TARGET_UNAVAILABLE" : "LOAD_FAILED",
    });
  }

  return (
    <>
      <PageHeader
        title={target?.name ?? "Target workspace"}
        breadcrumbs={[
          { label: "My Targets", href: "/analysis-targets" },
          { label: target?.name ?? "Target workspace" },
        ]}
      />
      {!target ? (
        <ErrorState
          message={
            unavailable
              ? "This target isn't available to your account. Go back to My Targets."
              : "We couldn't load this target. Please try again."
          }
          actions={
            <>
              {!unavailable && <RetryTargetsButton />}
              <Button variant="outline" asChild>
                <Link href="/analysis-targets" prefetch={false}>
                  Back to My Targets
                </Link>
              </Button>
            </>
          }
        />
      ) : (
        <div className="space-y-6">
          <WorkspaceIngestion
            key={`${target.id}:${ingestion?.state}:${ingestion?.finishedAt}`}
            targetId={target.id}
            targetName={target.name}
            sourceUrl={target.sourceUrl}
            initialSummary={ingestion}
            unavailableReason={
              !ingestionEnabled()
                ? ingestionErrorMessage("INGESTION_DISABLED")
                : !ingestionStorageApproved()
                  ? ingestionErrorMessage("STORAGE_NOT_APPROVED")
                  : !ingestionRecoveryConfigured()
                    ? ingestionErrorMessage("RECOVERY_NOT_CONFIGURED")
                    : null
            }
          />
          {reviews === null ? (
            <Card className="space-y-4">
              <h2 className="text-xl font-semibold">Reviews</h2>
              <ErrorAlert message="We couldn't load the saved reviews. Please try again." />
              <RetryTargetsButton />
            </Card>
          ) : (
            <ReviewList reviews={reviews} />
          )}
        </div>
      )}
    </>
  );
}
