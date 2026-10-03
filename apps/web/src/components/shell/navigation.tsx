"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "../cn";

const links = [
  { href: "/", label: "Chat" },
  { href: "/dashboard", label: "Analytics" },
  { href: "/cache", label: "Cache Explorer" },
] as const;

export function Navigation({ onNavigate, stacked = false }: { onNavigate?: () => void; stacked?: boolean }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Primary" className={cn("flex gap-1", stacked ? "flex-col" : "flex-row items-center")}>
      {links.map((link) => {
        const active = link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            onClick={onNavigate}
            className={cn(
              "rounded-control px-3 py-2 text-sm transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
              active ? "bg-accent-soft font-medium text-ink" : "text-secondary hover:bg-muted-surface hover:text-ink",
            )}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
