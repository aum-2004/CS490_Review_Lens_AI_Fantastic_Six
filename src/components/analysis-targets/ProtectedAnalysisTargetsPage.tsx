import { AppShell } from "@/components/shared/AppShell";
import { PageHeader } from "@/components/shared/PageHeader";
import { ErrorState } from "@/components/shared/ErrorState";
import { TargetList } from "@/components/analysis-targets/TargetList";
import { RetryTargetsButton } from "@/components/analysis-targets/RetryTargetsButton";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { TargetWithIngestion } from "@/services/analysis-targets/list-targets-with-ingestion";
import { requirePageUser } from "@/services/auth/access-control";
import { listTargetsWithIngestion } from "@/services/analysis-targets/list-targets-with-ingestion";

export async function ProtectedAnalysisTargetsPage() {
  // Keep redirect outside the data-error catch. Never load targets before verification.
  const user = await requirePageUser("/analysis-targets");
  let targets: TargetWithIngestion[] | null = null;
  try {
    const client = await createSupabaseServerClient();
    targets = await listTargetsWithIngestion(client, user.id);
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
