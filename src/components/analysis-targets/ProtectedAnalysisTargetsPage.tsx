import { AppShell } from "@/components/shared/AppShell";
import { PageHeader } from "@/components/shared/PageHeader";
import { ErrorState } from "@/components/shared/ErrorState";
import { TargetList } from "@/components/analysis-targets/TargetList";
import { RetryTargetsButton } from "@/components/analysis-targets/RetryTargetsButton";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  listAnalysisTargets,
  type AnalysisTargetListItem,
} from "@/services/analysis-targets/list-analysis-targets";
import { requirePageUser } from "@/services/auth/access-control";

export async function ProtectedAnalysisTargetsPage() {
  // Keep redirect outside the data-error catch. Never load targets before verification.
  const user = await requirePageUser("/analysis-targets");
  let targets: AnalysisTargetListItem[] | null = null;
  try {
    const client = await createSupabaseServerClient();
    targets = await listAnalysisTargets(client, user.id);
  } catch {
    console.error("Analysis target operation failed", {
      operation: "list",
      category: "LOAD_FAILED",
    });
  }

  return (
    <AppShell email={user.email}>
      <PageHeader
        title="My Targets"
        description="Your saved businesses and products, ready to explore."
      />
      {targets === null ? (
        <ErrorState
          message="We couldn't load your targets. Please try again."
          actions={<RetryTargetsButton />}
        />
      ) : (
        <TargetList targets={targets} />
      )}
    </AppShell>
  );
}
