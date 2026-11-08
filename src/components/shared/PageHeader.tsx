import Link from "next/link";
import type { ReactNode } from "react";

type Breadcrumb = { label: string; href?: string };

export function PageHeader({
  title,
  description,
  breadcrumbs,
  action,
}: {
  title: string;
  description?: string;
  breadcrumbs?: Breadcrumb[];
  action?: ReactNode;
}) {
  return (
    <header className="mb-6 space-y-4">
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav aria-label="Breadcrumb">
          <ol className="flex flex-wrap gap-2 text-sm text-muted-foreground">
            {breadcrumbs.map((crumb, index) => (
              <li key={index} className="min-w-0 break-words">
                {crumb.href ? (
                  <Link
                    href={crumb.href}
                    prefetch={false}
                    className="rounded-sm underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    {crumb.label}
                  </Link>
                ) : (
                  <span aria-current={index === breadcrumbs.length - 1 ? "page" : undefined}>
                    {crumb.label}
                  </span>
                )}
              </li>
            ))}
          </ol>
        </nav>
      )}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 max-w-full">
          <h1 className="break-words text-3xl font-semibold">{title}</h1>
          {description && <p className="mt-2 text-muted-foreground">{description}</p>}
        </div>
        {action}
      </div>
    </header>
  );
}
