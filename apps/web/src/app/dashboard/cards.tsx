import type { ReactNode } from "react";

export function Section({
  eyebrow,
  title,
  description,
  action,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium tracking-wide text-neutral-500 uppercase">{eyebrow}</p>
          <h2 className="mt-1 text-base font-semibold">{title}</h2>
          <p className="mt-1 max-w-3xl text-sm text-neutral-600">{description}</p>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function MetricCard({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-md border border-neutral-200 bg-neutral-50 px-4 py-3">
      <p className="text-sm text-neutral-600">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
      {detail ? <p className="mt-1 text-sm text-neutral-500">{detail}</p> : null}
    </div>
  );
}

export function CardGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">{children}</div>;
}

export function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-md border border-neutral-200 px-4 py-3">
      <h3 className="text-sm font-medium">{title}</h3>
      <div className="mt-3">{children}</div>
    </div>
  );
}
