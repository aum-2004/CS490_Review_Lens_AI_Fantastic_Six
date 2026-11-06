import Link from "next/link";

const foundationAreas = [
  {
    name: "Frontend",
    path: "src/app, src/components",
    description: "Pages, layouts, and reusable UI built with React and Tailwind CSS.",
  },
  {
    name: "Backend",
    path: "src/app/api, src/services",
    description: "Next.js Route Handlers and server-side business logic.",
  },
  {
    name: "Data",
    path: "src/lib/supabase",
    description: "Supabase Auth session integration and the PostgreSQL configuration boundary.",
  },
];

export default function Home() {
  return (
    <main className="flex flex-1 items-center justify-center bg-zinc-50 px-4 py-16 dark:bg-zinc-950 sm:px-8">
      <div className="w-full max-w-3xl">
        <p className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300">
          <span aria-hidden="true" className="size-2 rounded-full bg-emerald-500" />
          Application foundation operational
        </p>

        <h1 className="mt-6 text-4xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50 sm:text-5xl">
          ReviewLens AI
        </h1>
        <p className="mt-4 max-w-2xl text-lg leading-8 text-zinc-600 dark:text-zinc-400">
          Collect public reviews for a business or product, keep each dataset private to its owner,
          and ask questions answered only from that review evidence.
        </p>

        <ul className="mt-10 grid gap-4 sm:grid-cols-3">
          {foundationAreas.map((area) => (
            <li
              key={area.name}
              className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"
            >
              <h2 className="font-semibold text-zinc-950 dark:text-zinc-50">{area.name}</h2>
              <p className="mt-1 font-mono text-xs text-zinc-500 dark:text-zinc-400">{area.path}</p>
              <p className="mt-3 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                {area.description}
              </p>
            </li>
          ))}
        </ul>

        <p className="mt-10 text-sm text-zinc-500 dark:text-zinc-400">
          <Link href="/login" className="underline underline-offset-4">
            Sign in or register
          </Link>{" "}
          to establish your ReviewLens session. Analysis targets and review ingestion arrive in
          later stories.
        </p>
      </div>
    </main>
  );
}
