import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { TargetForm } from "@/components/analysis-targets/TargetForm";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
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
  await requirePageUser("/analysis-targets/new");

  return (
    <main className="flex-1 bg-muted/30 px-4 py-10 sm:px-6 sm:py-14">
      <div className="mx-auto w-full max-w-xl">
        <nav aria-label="Breadcrumb" className="mb-5 text-sm text-muted-foreground">
          <ol className="flex items-center gap-2">
            <li>
              <Link
                className="rounded-sm underline-offset-4 hover:underline focus-visible:outline-2"
                href="/analysis-targets"
              >
                My Targets
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li aria-current="page">New Target</li>
          </ol>
        </nav>

        <div className="mb-8">
          <h1 className="text-3xl font-semibold tracking-tight">Create a new target</h1>
          <p className="mt-2 text-muted-foreground">
            Add a Google Maps business listing to begin collecting and analyzing its reviews.
          </p>
        </div>

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
    </main>
  );
}

function NewAnalysisTargetLoading() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <p className="text-sm text-muted-foreground" role="status">
        Loading target form…
      </p>
    </main>
  );
}
