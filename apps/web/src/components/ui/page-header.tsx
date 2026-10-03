import type { ReactNode } from "react";

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  action,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow ? (
          <p className="text-xs font-medium tracking-wide text-faint uppercase">{eyebrow}</p>
        ) : null}
        <h1 className="text-[1.75rem] leading-tight font-semibold tracking-tight text-ink">{title}</h1>
        {subtitle ? <p className="mt-2 max-w-2xl text-sm leading-6 text-secondary">{subtitle}</p> : null}
      </div>
      {action}
    </header>
  );
}
