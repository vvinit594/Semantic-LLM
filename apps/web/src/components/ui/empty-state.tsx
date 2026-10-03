export function EmptyState({ title, detail }: { title: string; detail?: string }) {
  return (
    <div role="status" className="rounded-card border border-dashed border-line-strong bg-surface px-5 py-8">
      <p className="text-sm font-medium text-ink">{title}</p>
      {detail ? <p className="mt-1 max-w-lg text-sm leading-6 text-secondary">{detail}</p> : null}
    </div>
  );
}
