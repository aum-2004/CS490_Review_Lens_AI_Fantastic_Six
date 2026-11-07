import { Skeleton } from "@/components/ui/Skeleton";

export default function WorkspaceLoading() {
  return (
    <div role="status" className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <span className="sr-only">Loading target workspace…</span>
      <div aria-hidden="true" className="space-y-6">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-52 rounded-lg border border-border" />
        <Skeleton className="h-52 rounded-lg border border-border" />
      </div>
    </div>
  );
}
