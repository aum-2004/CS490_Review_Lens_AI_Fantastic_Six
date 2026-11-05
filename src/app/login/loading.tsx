export default function Loading() {
  return (
    <main
      className="flex flex-1 items-center justify-center px-4 py-16"
      aria-busy="true"
      aria-label="Loading account"
    >
      <div className="w-full max-w-xl space-y-6 motion-safe:animate-pulse">
        <div className="h-8 w-48 rounded-md bg-muted" />
        <div className="space-y-4 rounded-lg border border-border p-6">
          <div className="h-10 rounded-md bg-muted" />
          <div className="h-10 rounded-md bg-muted" />
          <div className="h-10 w-32 rounded-md bg-muted" />
        </div>
      </div>
    </main>
  );
}
