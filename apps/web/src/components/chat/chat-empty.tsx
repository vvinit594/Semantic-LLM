const EXAMPLES = [
  "What is a computer?",
  "Explain how Redis works.",
  "What is semantic caching?",
] as const;

export function ChatEmpty({ disabled, onAsk }: { disabled: boolean; onAsk: (question: string) => void }) {
  return (
    <section className="rounded-card border border-line bg-surface p-5 shadow-card">
      <div className="flex items-start gap-4">
        <CacheMark />
        <div className="min-w-0">
          <h2 className="text-sm font-medium text-ink">Reuse a safe answer before calling the model</h2>
          <p className="mt-1 text-sm leading-6 text-secondary">
            A new question is compared with stored ones. A safe match returns the cached answer. Otherwise the model answers, and that answer can be reused later.
          </p>
        </div>
      </div>
      <ol className="mt-5 grid gap-2 text-sm text-secondary sm:grid-cols-3">
        <li className="rounded-control bg-muted-surface px-3 py-2">
          <span className="block text-[11px] font-medium tracking-wide text-faint uppercase">1</span>
          Query
        </li>
        <li className="rounded-control bg-muted-surface px-3 py-2">
          <span className="block text-[11px] font-medium tracking-wide text-faint uppercase">2</span>
          Semantic search
        </li>
        <li className="rounded-control bg-muted-surface px-3 py-2">
          <span className="block text-[11px] font-medium tracking-wide text-faint uppercase">3</span>
          Cached answer, or the model
        </li>
      </ol>
      <div className="mt-5 flex flex-col gap-2">
        <p className="text-xs font-medium tracking-wide text-faint uppercase">Try a question</p>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {EXAMPLES.map((question) => (
            <button
              key={question}
              type="button"
              disabled={disabled}
              onClick={() => onAsk(question)}
              className="rounded-control border border-line bg-canvas px-3 py-2 text-left text-sm text-ink transition-colors duration-150 hover:border-line-strong hover:bg-muted-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50"
            >
              {question}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

function CacheMark() {
  return (
    <svg viewBox="0 0 40 40" className="size-10 shrink-0 text-accent" fill="none" aria-hidden="true">
      <rect x="3" y="8" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <rect x="23" y="22" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M17 13h4a6 6 0 0 1 6 6v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="10" cy="13" r="1.2" fill="currentColor" />
      <circle cx="30" cy="27" r="1.2" fill="currentColor" />
    </svg>
  );
}
