"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Layers, PanelsTopLeft, Plus, ScanEye } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { AccountMenu } from "./AccountMenu";
import { ThemeToggle } from "./ThemeToggle";
import type { SavedAnalysisLink } from "./AppShell";
import { RetryTargetsButton } from "@/components/analysis-targets/RetryTargetsButton";

export function Navigation({
  email,
  savedAnalyses,
}: {
  email: string | null;
  savedAnalyses: SavedAnalysisLink[] | null;
}) {
  const pathname = usePathname();
  const workspace = /^\/analysis-targets\/(?!new(?:\/|$))[^/]+/.test(pathname);
  const links = [
    {
      label: "Workspace",
      href: workspace ? pathname : "/analysis-targets",
      icon: PanelsTopLeft,
      active: workspace,
    },
    {
      label: "My Targets",
      href: "/analysis-targets",
      icon: Layers,
      active: pathname === "/analysis-targets",
    },
    {
      label: "New Target",
      href: "/analysis-targets/new",
      icon: Plus,
      active: pathname === "/analysis-targets/new",
    },
  ];
  return (
    <aside className="studio-rail">
      <Link href="/analysis-targets" prefetch={false} aria-label="RL home" className="studio-brand">
        <span className="studio-brandmark">
          <ScanEye size={20} aria-hidden="true" />
        </span>
        RL
      </Link>
      <nav aria-label="Main navigation" className="flex flex-wrap gap-1.5 md:flex-col">
        {links.map(({ label, href, icon: Icon, active }) => (
          <Button
            key={label}
            variant="ghost"
            asChild
            className={`justify-start ${active ? "bg-accent text-accent-foreground" : "text-muted-foreground"}`}
          >
            <Link href={href} prefetch={false} aria-current={active ? "page" : undefined}>
              <Icon size={16} aria-hidden="true" />
              {label}
            </Link>
          </Button>
        ))}
      </nav>
      <section aria-labelledby="saved-analyses-heading" className="min-w-0 space-y-3">
        <h2 id="saved-analyses-heading" className="text-xs font-semibold text-muted-foreground">
          Saved analyses
        </h2>
        {savedAnalyses === null ? (
          <div className="space-y-2">
            <p role="alert" className="text-sm text-muted-foreground">
              We couldn&apos;t load your saved analyses.
            </p>
            <RetryTargetsButton />
          </div>
        ) : savedAnalyses.length === 0 ? (
          <div className="space-y-2 text-sm text-muted-foreground">
            <Layers size={16} aria-hidden="true" />
            <p>No saved analyses yet. Create a target to save your first analysis.</p>
            <Button asChild>
              <Link href="/analysis-targets/new" prefetch={false}>
                Create target
              </Link>
            </Button>
          </div>
        ) : (
          <nav aria-label="Saved analyses" className="max-h-64 space-y-1 overflow-y-auto">
            {savedAnalyses.map(({ id, name }) => {
              const href = `/analysis-targets/${encodeURIComponent(id)}`;
              const active = pathname === href;
              return (
                <Button
                  key={id}
                  variant="ghost"
                  asChild
                  className={`h-auto w-full min-w-0 justify-start whitespace-normal text-left ${active ? "bg-accent text-accent-foreground" : "text-muted-foreground"}`}
                >
                  <Link href={href} prefetch={false} aria-current={active ? "page" : undefined}>
                    <span className="min-w-0 break-words [overflow-wrap:anywhere]">{name}</span>
                  </Link>
                </Button>
              );
            })}
          </nav>
        )}
      </section>
      <div className="mt-auto grid min-w-0 gap-4 border-t border-border pt-4">
        <ThemeToggle />
        <p className="text-xs text-muted-foreground">Personal workspace</p>
        <AccountMenu email={email} />
      </div>
    </aside>
  );
}
