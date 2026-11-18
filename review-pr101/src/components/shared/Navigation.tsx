import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { AccountMenu } from "./AccountMenu";

export function Navigation({ email }: { email: string | null }) {
  return (
    <header className="border-b border-border">
      <nav
        aria-label="Main navigation"
        className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-4 py-4 sm:px-6"
      >
        <Link
          href="/analysis-targets"
          prefetch={false}
          className="rounded-sm text-lg font-semibold focus-visible:outline-2 focus-visible:outline-ring"
        >
          ReviewLens
        </Link>
        <Link
          href="/analysis-targets"
          prefetch={false}
          className="rounded-sm text-sm underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring"
        >
          My Targets
        </Link>
        <Button asChild>
          <Link href="/analysis-targets/new" prefetch={false}>
            New Target
          </Link>
        </Button>
        <div className="ml-auto max-w-full">
          <AccountMenu email={email} />
        </div>
      </nav>
    </header>
  );
}
