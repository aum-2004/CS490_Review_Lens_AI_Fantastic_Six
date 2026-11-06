import type { ReactNode } from "react";

import { Navigation } from "./Navigation";

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
      <Navigation email={email} />
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
