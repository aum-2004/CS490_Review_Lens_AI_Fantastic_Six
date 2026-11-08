import { Suspense, type ReactNode } from "react";
import { AppShell } from "@/components/shared/AppShell";
import { requirePageUser } from "@/services/auth/access-control";
import WorkspaceLoading from "./loading";

async function VerifiedWorkspaceShell({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ targetId: string }>;
}) {
  const { targetId } = await params;
  const user = await requirePageUser(`/analysis-targets/${encodeURIComponent(targetId)}`);
  return <AppShell email={user.email}>{children}</AppShell>;
}

/** The page still independently authenticates before any protected reads. */
export default function WorkspaceLayout({
  children,
  params,
}: LayoutProps<"/analysis-targets/[targetId]">) {
  return (
    <Suspense fallback={<WorkspaceLoading />}>
      <VerifiedWorkspaceShell params={params}>{children}</VerifiedWorkspaceShell>
    </Suspense>
  );
}
