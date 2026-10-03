import type { ReactNode } from "react";
import { cn } from "../cn";

export function Card({
  title,
  children,
  className,
}: {
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-card border border-line bg-surface p-4 shadow-card", className)}>
      {title ? <h3 className="text-sm font-medium text-ink">{title}</h3> : null}
      {title ? <div className="mt-3">{children}</div> : children}
    </div>
  );
}
