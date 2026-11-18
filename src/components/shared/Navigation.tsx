"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Layers, PanelsTopLeft, Plus, ScanEye } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { AccountMenu } from "./AccountMenu";
import { ThemeToggle } from "./ThemeToggle";

export function Navigation({ email }: { email: string | null }) {
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
      <div className="mt-auto grid min-w-0 gap-4 border-t border-border pt-4">
        <ThemeToggle />
        <p className="text-xs text-muted-foreground">Personal workspace</p>
        <AccountMenu email={email} />
      </div>
    </aside>
  );
}
