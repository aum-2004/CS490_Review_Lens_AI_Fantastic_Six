import type { ReactNode } from "react";

import { Navigation } from "./Navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { listAnalysisTargets } from "@/services/analysis-targets/list-analysis-targets";

export type SavedAnalysisLink = { id: string; name: string };

/** Shared protected-page shell. Each page must independently verify before loading data. */
export async function AppShell({
  userId,
  email,
  children,
}: {
  /** Verified session identity supplied by the protected page or layout. */
  userId: string;
  email: string | null;
  children: ReactNode;
}) {
  let savedAnalyses: SavedAnalysisLink[] | null = null;
  try {
    const client = await createSupabaseServerClient();
    savedAnalyses = (await listAnalysisTargets(client, userId)).map(({ id, name }) => ({
      id,
      name,
    }));
  } catch {
    console.error("Analysis target operation failed", {
      operation: "sidebar",
      category: "LOAD_FAILED",
    });
  }
  return (
    <div className="studio-shell min-h-screen bg-background text-foreground">
      <a
        href="#main-content"
        className="sr-only rounded-md bg-background p-3 focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:ring-2 focus:ring-ring"
      >
        Skip to main content
      </a>
      <Navigation key={userId} email={email} savedAnalyses={savedAnalyses} />
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
