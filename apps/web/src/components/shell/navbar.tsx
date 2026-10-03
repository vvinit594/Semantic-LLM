"use client";

import { useState } from "react";
import { Logo } from "./logo";
import { Navigation } from "./navigation";
import { StatusIndicator } from "./status-indicator";
import { ThemeToggle } from "./theme-toggle";

export function Navbar({ apiUrl }: { apiUrl: string }) {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-20 border-b border-line bg-canvas">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-3 px-4 sm:px-6">
        <Logo />
        <div className="ml-4 hidden md:block">
          <Navigation />
        </div>
        <div className="ml-auto flex items-center gap-2">
          <StatusIndicator apiUrl={apiUrl} />
          <ThemeToggle />
          <button
            type="button"
            className="grid size-9 place-items-center rounded-control border border-line text-secondary md:hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            aria-expanded={open}
            aria-controls="mobile-navigation"
            onClick={() => setOpen((current) => !current)}
          >
            <span className="sr-only">{open ? "Close menu" : "Open menu"}</span>
            <MenuIcon open={open} />
          </button>
        </div>
      </div>
      {open ? (
        <div id="mobile-navigation" className="border-t border-line px-4 py-3 md:hidden">
          <p className="mb-3 text-[11px] text-faint">Semantic LLM Caching Infrastructure</p>
          <Navigation stacked onNavigate={() => setOpen(false)} />
        </div>
      ) : null}
    </header>
  );
}

function MenuIcon({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 16 16" className="size-4" fill="none" aria-hidden="true">
      {open ? (
        <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      ) : (
        <path d="M3 4.5h10M3 8h10M3 11.5h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      )}
    </svg>
  );
}
