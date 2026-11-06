import type { Metadata } from "next";
import { Suspense } from "react";
import { ProtectedAnalysisTargetsPage } from "@/components/analysis-targets/ProtectedAnalysisTargetsPage";
import TargetsLoading from "./loading";

export const metadata: Metadata = { title: "My Targets | ReviewLens AI" };

export default function AnalysisTargetsPage() {
  return (
    <Suspense fallback={<TargetsLoading />}>
      <ProtectedAnalysisTargetsPage />
    </Suspense>
  );
}
