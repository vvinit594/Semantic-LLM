export function LoadingSkeleton({ label }: { label: string }) {
  return (
    <div role="status" className="flex flex-col gap-3">
      <span className="sr-only">{label}</span>
      <div className="h-4 w-36 animate-pulse rounded-control bg-muted-surface motion-safe" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="h-24 animate-pulse rounded-card bg-muted-surface motion-safe" />
        <div className="h-24 animate-pulse rounded-card bg-muted-surface motion-safe" />
        <div className="hidden h-24 animate-pulse rounded-card bg-muted-surface motion-safe sm:block" />
      </div>
    </div>
  );
}
