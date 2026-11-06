"use client";

import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/shared/PageHeader";
import { ErrorState } from "@/components/shared/ErrorState";

export default function TargetsError({ retry }: { retry: () => void }) {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6">
      <PageHeader title="My Targets" />
      <ErrorState
        message="Something went wrong on our side. Please try again in a moment."
        actions={
          <>
            <Button variant="outline" onClick={retry}>
              Try again
            </Button>
            <Button variant="ghost" asChild>
              <Link href="/login" prefetch={false}>
                Sign in
              </Link>
            </Button>
          </>
        }
      />
    </main>
  );
}
