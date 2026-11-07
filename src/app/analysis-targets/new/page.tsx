import type { Metadata } from "next";
import { Suspense } from "react";

import { TargetForm } from "@/components/analysis-targets/TargetForm";
import { AppShell } from "@/components/shared/AppShell";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { requirePageUser } from "@/services/auth/access-control";

export const metadata: Metadata = {
  title: "Create target | ReviewLens AI",
  description: "Create a Google Maps analysis target in ReviewLens AI.",
};

export default function NewAnalysisTargetPage() {
  return (
    <Suspense fallback={<NewAnalysisTargetLoading />}>
      <ProtectedNewAnalysisTargetPage />
    </Suspense>
  );
}

export async function ProtectedNewAnalysisTargetPage() {
  const user = await requirePageUser("/analysis-targets/new");

  return (
    <AppShell email={user.email}>
      <div className="mx-auto w-full max-w-xl">
        <PageHeader
          title="Create a new target"
          description="Add a Google Maps business listing to begin collecting and analyzing its reviews."
          breadcrumbs={[
            { label: "My Targets", href: "/analysis-targets" },
            { label: "New Target" },
          ]}
        />

        <Card>
          <CardHeader>
            <CardTitle>
              <h2>Target information</h2>
            </CardTitle>
            <CardDescription>
              Give this target a clear name and provide its Google Maps place link.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <TargetForm />
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}

export function NewAnalysisTargetLoading() {
  return (
    <main
      className="flex flex-1 items-center justify-center px-4 py-16"
      aria-busy="true"
      aria-label="Loading target form"
    >
      <div className="w-full max-w-xl space-y-4">
        <p className="sr-only" role="status">
          Loading target form…
        </p>
        <Skeleton aria-hidden="true" className="h-4 w-32" />
        <Skeleton aria-hidden="true" className="h-10 w-72 max-w-full" />
        <Skeleton aria-hidden="true" className="h-80 w-full" />
      </div>
    </main>
  );
}
