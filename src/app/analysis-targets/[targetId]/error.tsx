"use client";

import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/shared/PageHeader";
import { ErrorState } from "@/components/shared/ErrorState";

export default function WorkspaceError({ retry }: { retry: () => void }) {
  return (
    <div>
      <PageHeader title="Target workspace" />
      <ErrorState
        message="Something went wrong on our side. Please try again in a moment."
        actions={
          <>
            <Button variant="outline" onClick={retry}>
              Try again
            </Button>
            <Button variant="ghost" asChild>
              <Link href="/analysis-targets" prefetch={false}>
                Back to My Targets
              </Link>
            </Button>
          </>
        }
      />
    </div>
  );
}
