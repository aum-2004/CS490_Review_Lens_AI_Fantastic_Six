import type { ReactNode } from "react";

import { Navigation } from "./Navigation";

/** Shared protected-page shell. Each page must independently verify before loading data. */
export function AppShell({ email, children }: { email: string | null; children: ReactNode }) {
  return (
    <div className="studio-shell min-h-screen bg-background text-foreground">
      <a
        href="#main-content"
        className="sr-only rounded-md bg-background p-3 focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:ring-2 focus:ring-ring"
      >
        Skip to main content
      </a>
      <Navigation email={email} />
      <div className="flex min-w-0 flex-col">
        <main
          id="main-content"
          tabIndex={-1}
          className="mx-auto w-full max-w-7xl flex-1 px-5 py-6 md:px-7"
        >
          {children}
        </main>
        <footer className="border-t border-border px-5 py-4 text-xs text-muted-foreground md:px-7">
          Analysis stays within your selected target and its saved Google Maps reviews.
        </footer>
      </div>
    </div>
  );
}
