import type { ReactNode } from "react";

export function Tooltip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="group relative inline-flex">
      {children}
      <span
        role="tooltip"
        className="pointer-events-none absolute top-full left-1/2 z-30 mt-2 hidden -translate-x-1/2 rounded-control border border-line bg-surface px-2 py-1 text-xs whitespace-nowrap text-secondary shadow-card group-focus-within:block group-hover:block"
      >
        {label}
      </span>
    </span>
  );
}
