export function SearchingState() {
  return (
    <div role="status" className="rounded-card border border-line bg-surface p-4 shadow-card">
      <p className="text-sm font-medium text-ink">Searching semantic cache...</p>
      <p className="mt-1 text-sm text-secondary">Looking for a safe stored answer before calling the model.</p>
      <div className="mt-4 flex flex-col gap-2" aria-hidden="true">
        <div className="shimmer h-3 w-2/3 rounded-full" />
        <div className="shimmer h-3 w-full rounded-full" />
        <div className="shimmer h-3 w-5/6 rounded-full" />
      </div>
    </div>
  );
}
