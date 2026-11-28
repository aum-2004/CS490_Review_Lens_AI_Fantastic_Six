import Link from "next/link";
import { PageHeader } from "@/components/shared/PageHeader";
import { ErrorState } from "@/components/shared/ErrorState";
import { ErrorAlert } from "@/components/shared/ErrorAlert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import {
  WorkspaceIngestionProvider,
  WorkspaceIngestionStatus,
} from "@/components/ingestion/WorkspaceIngestionState";
import { WorkspaceIngestion } from "@/components/ingestion/WorkspaceIngestion";
import { ReviewBrowser } from "@/components/reviews/ReviewBrowser";
import { ReviewSummaryCard } from "@/components/reviews/ReviewSummaryCard";
import { ReviewQuestions } from "@/components/reviews/ReviewQuestions";
import { RetryTargetsButton } from "./RetryTargetsButton";
import { TargetSwitcher } from "./TargetSwitcher";
import { RenameAnalysis } from "./RenameAnalysis";
import {
  listAnalysisTargets,
  type AnalysisTargetListItem,
} from "@/services/analysis-targets/list-analysis-targets";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requirePageUser } from "@/services/auth/access-control";
import type { AnalysisTarget } from "@/services/analysis-targets/analysis-target-repository";
import {
  getOwnedTargetOrThrow,
  TargetNotFoundError,
} from "@/services/analysis-targets/target-ownership";
import { createSupabaseReviewStore } from "@/services/reviews/supabase-review-store";
import type { Review } from "@/services/reviews/review-service";
import { getReviewSummary, type ReviewSummary } from "@/services/reviews/review-summary";
import {
  getLatestAttempt,
  summarizeAttempt,
} from "@/services/ingestion/ingestion-attempt-repository";
import { ingestionEnabled, ingestionStorageApproved } from "@/services/ingestion/ingestion-runtime";
import { ingestionRecoveryConfigured } from "@/services/ingestion/ingestion-recovery";
import { ingestionErrorMessage, type IngestionSummary } from "@/services/ingestion/ingestion-state";

export async function ProtectedTargetWorkspace({
  params,
  searchParams,
}: {
  params: Promise<{ targetId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { targetId } = await params;
  // Authenticate on every render, including direct navigation and refresh.
  const user = await requirePageUser(`/analysis-targets/${encodeURIComponent(targetId)}`);
  let target: AnalysisTarget | undefined;
  let unavailable = false;
  let reviews: Review[] | null = null;
  let ingestion: IngestionSummary | null = null;
  let targets: AnalysisTargetListItem[] | null = null;
  let reviewSummary: ReviewSummary | null = null;
  let reviewSummaryUnavailable = false;
  try {
    const client = await createSupabaseServerClient();
    target = await getOwnedTargetOrThrow(client, targetId, user.id);
    try {
      targets = await listAnalysisTargets(client, user.id);
    } catch {
      console.error("Workspace operation failed", {
        operation: "switch-targets",
        category: "LOAD_FAILED",
      });
    }
    try {
      ingestion = summarizeAttempt(await getLatestAttempt(client, user.id, target.id));
    } catch {
      console.error("Workspace operation failed", {
        operation: "ingestion-status",
        category: "LOAD_FAILED",
      });
    }
    // Child data is never requested before the parent ownership check succeeds.
    const reviewStore = createSupabaseReviewStore(client);
    try {
      reviews = await reviewStore.listReviews(target.id);
    } catch {
      console.error("Workspace operation failed", {
        operation: "reviews",
        category: "LOAD_FAILED",
      });
    }
    try {
      reviewSummary = await getReviewSummary(reviewStore, client, user.id, target.id);
    } catch {
      reviewSummaryUnavailable = true;
      console.error("Workspace operation failed", {
        operation: "review-summary",
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
  const created = target && (await searchParams)?.created === "1";
  const unavailableReason = !ingestionEnabled()
    ? ingestionErrorMessage("INGESTION_DISABLED")
    : !ingestionStorageApproved()
      ? ingestionErrorMessage("STORAGE_NOT_APPROVED")
      : !ingestionRecoveryConfigured()
        ? ingestionErrorMessage("RECOVERY_NOT_CONFIGURED")
        : null;

  return (
    <WorkspaceIngestionProvider
      key={`${user.id}:${targetId}:${ingestion?.state}:${ingestion?.finishedAt}`}
      initialSummary={ingestion}
    >
      {target && (
        <div className="workspace-context flex flex-wrap items-center gap-6">
          <div className="min-w-0">
            <p className="mb-1 text-xs font-semibold">Active analysis target</p>
            <TargetSwitcher
              key={target.id}
              activeTarget={{ id: target.id, name: target.name, sourceUrl: target.sourceUrl }}
              targets={targets?.map(({ id, name, sourceUrl }) => ({ id, name, sourceUrl })) ?? null}
            />
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Google Maps</p>
            <WorkspaceIngestionStatus />
          </div>
        </div>
      )}
      <p className="mb-1 text-[11px] font-bold uppercase tracking-[1.5px] text-muted-foreground">
        Analysis workspace
      </p>
      <PageHeader
        title={target?.name ?? "Target workspace"}
        breadcrumbs={[
          { label: "My Targets", href: "/analysis-targets" },
          { label: target?.name ?? "Target workspace" },
        ]}
      />
      {target && (
        <RenameAnalysis key={`${user.id}:${target.id}`} targetId={target.id} name={target.name} />
      )}
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
        <div className="workspace-grid">
          <div className="workspace-summary">
            {reviewSummary ? (
              <ReviewSummaryCard summary={reviewSummary} targetName={target.name} />
            ) : reviewSummaryUnavailable ? (
              <Card className="space-y-4">
                <h2 className="text-xl font-semibold">Review summary</h2>
                <ErrorAlert message="We couldn't load the review summary. Please try again." />
                <RetryTargetsButton />
              </Card>
            ) : null}
          </div>
          <div className="workspace-questions">
            <ReviewQuestions
              userId={user.id}
              targetId={target.id}
              targetName={target.name}
              reviewsAvailable={reviews !== null && reviews.length > 0}
              reviews={reviews?.map(({ id, analysisTargetId, rating, text, reviewDate }) => ({
                id,
                analysisTargetId,
                rating,
                text,
                reviewDate,
              }))}
              unavailableMessage={
                reviews === null
                  ? "We couldn't load the saved reviews, so review questions are unavailable. Retry loading the reviews before asking ReviewLens questions."
                  : unavailableReason
                    ? `No saved reviews are available for this target. ${unavailableReason}`
                    : ingestion?.state === "failed"
                      ? "The most recent ingestion failed and no saved reviews are available. Use the Ingestion panel to resolve the failure before asking ReviewLens questions."
                      : ingestion?.state === "processing"
                        ? "Ingestion is in progress and no saved reviews are available yet. Wait for ingestion to complete before asking ReviewLens questions."
                        : ingestion?.state === "succeeded"
                          ? "Ingestion completed, but no saved reviews are available for this target. Reload the workspace and contact the project team if reviews are still missing."
                          : undefined
              }
            />
          </div>
          <div className="workspace-source space-y-4">
            <WorkspaceIngestion
              key={`${target.id}:${ingestion?.state}:${ingestion?.finishedAt}`}
              targetId={target.id}
              created={!!created}
              targetName={target.name}
              sourceUrl={target.sourceUrl}
              unavailableReason={unavailableReason}
            />
          </div>
          <div className="workspace-reviews">
            {reviews === null ? (
              <Card className="space-y-4">
                <h2 className="text-xl font-semibold">Reviews</h2>
                <ErrorAlert message="We couldn't load the saved reviews. Please try again." />
                <RetryTargetsButton />
              </Card>
            ) : (
              <ReviewBrowser
                key={`${user.id}:${target.id}`}
                reviews={reviews.map(({ id, text, rating, reviewerName, reviewDate }) => ({
                  id,
                  text,
                  rating,
                  reviewerName,
                  reviewDate,
                }))}
              />
            )}
          </div>
        </div>
      )}
    </WorkspaceIngestionProvider>
  );
}
