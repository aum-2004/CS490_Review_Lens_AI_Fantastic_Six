"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import type { IngestionSummary } from "@/services/ingestion/ingestion-state";
import { IngestionStatus } from "./IngestionStatus";

type WorkspaceState = {
  summary: IngestionSummary | null;
  setSummary: (summary: IngestionSummary) => void;
  pending: boolean;
  setPending: (pending: boolean) => void;
};

const WorkspaceIngestionContext = createContext<WorkspaceState | null>(null);

/** The verified workspace keys this provider by account, target and persisted run. */
export function WorkspaceIngestionProvider({
  initialSummary,
  children,
}: {
  initialSummary: IngestionSummary | null;
  children: ReactNode;
}) {
  const [summary, setSummary] = useState(initialSummary);
  const [pending, setPending] = useState(false);
  return (
    <WorkspaceIngestionContext.Provider value={{ summary, setSummary, pending, setPending }}>
      {children}
    </WorkspaceIngestionContext.Provider>
  );
}

export function useWorkspaceIngestion() {
  const state = useContext(WorkspaceIngestionContext);
  if (!state) throw new Error("Workspace ingestion controls require their state provider.");
  return state;
}

/** The header observes the same confirmed state as the collection panel. */
export function WorkspaceIngestionStatus() {
  const state = useWorkspaceIngestion();
  if (state.pending) return <span role="status">Updating ingestion…</span>;
  return (
    <IngestionStatus
      state={state.summary?.state ?? null}
      skippedCount={state.summary?.skippedCount}
    />
  );
}
