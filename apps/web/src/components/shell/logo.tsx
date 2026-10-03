import Link from "next/link";

export function Logo() {
  return (
    <Link href="/" className="flex min-w-0 items-center gap-2.5 rounded-control focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
      <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-control bg-accent text-[11px] font-semibold tracking-wide text-accent-contrast">
        SC
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold tracking-tight text-ink">SemanticCache</span>
        <span className="hidden text-[11px] leading-4 text-faint sm:block">Semantic LLM Caching Infrastructure</span>
      </span>
    </Link>
  );
}
