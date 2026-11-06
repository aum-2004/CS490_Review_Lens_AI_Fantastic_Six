import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { AccountMenu } from "./AccountMenu";

/** Shared protected-page shell. Each page must independently verify before loading data. */
export function AppShell({ email, children }: { email: string | null; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <a
        href="#main-content"
        className="sr-only rounded-md bg-background p-3 focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:ring-2 focus:ring-ring"
      >
        Skip to main content
      </a>
      <header className="border-b border-border">
        <nav
          aria-label="Main navigation"
          className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-4 py-4 sm:px-6"
        >
          <Link
            href="/analysis-targets"
            prefetch={false}
            className="rounded-sm text-lg font-semibold focus-visible:outline-2 focus-visible:outline-ring"
          >
            ReviewLens
          </Link>
          <Link
            href="/analysis-targets"
            prefetch={false}
            className="rounded-sm text-sm underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring"
          >
            My Targets
          </Link>
          <Button asChild>
            <Link href="/analysis-targets/new" prefetch={false}>
              New Target
            </Link>
          </Button>
          <div className="ml-auto max-w-full">
            <AccountMenu email={email} />
          </div>
        </nav>
      </header>
      <main
        id="main-content"
        tabIndex={-1}
        className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-12"
      >
        {children}
      </main>
    </div>
  );
}
