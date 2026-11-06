import { AppShell } from "@/components/shared/AppShell";
import { Card } from "@/components/ui/Card";
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
      <div className="mb-8">
        <h1 className="text-3xl font-semibold">My Targets</h1>
        <p className="mt-2 text-muted-foreground">
          Your saved businesses and products, ready to explore.
        </p>
      </div>
      {targets === null ? (
        <Card className="space-y-4">
          <p role="alert">We couldn&apos;t load your targets. Please try again.</p>
          <RetryTargetsButton />
        </Card>
      ) : (
        <TargetList targets={targets} />
      )}
    </AppShell>
  );
}
