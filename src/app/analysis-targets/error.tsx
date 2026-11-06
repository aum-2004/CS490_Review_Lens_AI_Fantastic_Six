"use client";

import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

export default function TargetsError({ retry }: { retry: () => void }) {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6">
      <h1 className="mb-6 text-3xl font-semibold">My Targets</h1>
      <Card className="space-y-4">
        <p role="alert">Something went wrong on our side. Please try again in a moment.</p>
        <div className="flex flex-wrap gap-3">
          <Button variant="outline" onClick={retry}>
            Try again
          </Button>
          <Button variant="ghost" asChild>
            <Link href="/login" prefetch={false}>
              Sign in
            </Link>
          </Button>
        </div>
      </Card>
    </main>
  );
}
