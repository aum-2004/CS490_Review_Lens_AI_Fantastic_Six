import { Skeleton } from "@/components/ui/Skeleton";

export default function TargetsLoading() {
  return (
    <div role="status" className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <span className="sr-only">Loading your targets…</span>
      <div aria-hidden="true" className="space-y-6">
        <Skeleton className="h-10 w-48" />
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((item) => (
            <Skeleton key={item} className="h-52 rounded-lg border border-border" />
          ))}
        </div>
      </div>
    </div>
  );
}
