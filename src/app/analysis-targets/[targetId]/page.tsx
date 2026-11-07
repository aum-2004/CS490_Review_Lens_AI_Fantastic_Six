import type { Metadata } from "next";
import { Suspense } from "react";
import { ProtectedTargetWorkspace } from "@/components/analysis-targets/ProtectedTargetWorkspace";
import WorkspaceLoading from "./loading";

export const metadata: Metadata = { title: "Target workspace | ReviewLens AI" };

export default function TargetWorkspacePage({
  params,
  searchParams,
}: PageProps<"/analysis-targets/[targetId]">) {
  return (
    <Suspense fallback={<WorkspaceLoading />}>
      <ProtectedTargetWorkspace params={params} searchParams={searchParams} />
    </Suspense>
  );
}
