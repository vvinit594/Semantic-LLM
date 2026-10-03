import type { ReactNode } from "react";

export function Section({
  eyebrow,
  title,
  description,
  action,
  children,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0 flex-1">
          {eyebrow ? <p className="text-xs font-medium tracking-wide text-faint uppercase">{eyebrow}</p> : null}
          <h2 className="mt-1 text-base font-semibold tracking-tight text-ink">{title}</h2>
          {description ? <p className="mt-1 max-w-3xl text-sm leading-6 text-secondary">{description}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
