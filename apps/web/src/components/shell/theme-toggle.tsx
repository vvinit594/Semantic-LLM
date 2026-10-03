"use client";

import { Tooltip } from "../ui/tooltip";

const STORAGE_KEY = "semanticcache-theme";

export function ThemeToggle() {
  function toggle() {
    const dark = document.documentElement.dataset.theme === "dark";
    if (dark) {
      delete document.documentElement.dataset.theme;
      localStorage.setItem(STORAGE_KEY, "light");
      return;
    }
    document.documentElement.dataset.theme = "dark";
    localStorage.setItem(STORAGE_KEY, "dark");
  }

  return (
    <Tooltip label="Toggle color theme">
      <button
        type="button"
        onClick={toggle}
        aria-label="Toggle color theme"
        className="grid size-9 place-items-center rounded-control border border-line text-secondary transition-colors duration-150 hover:bg-muted-surface hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <SunIcon />
        <MoonIcon />
      </button>
    </Tooltip>
  );
}

function SunIcon() {
  return (
    <svg className="icon-sun size-4" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.2 3.2l1.1 1.1M11.7 11.7l1.1 1.1M3.2 12.8l1.1-1.1M11.7 4.3l1.1-1.1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg className="icon-moon size-4" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M10.2 2.2a5.2 5.2 0 1 0 3.6 8.8 4.4 4.4 0 0 1-3.6-8.8Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}
