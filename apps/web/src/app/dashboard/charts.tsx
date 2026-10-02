export type Bar = {
  label: string;
  value: number;
  display: string;
};

export function BarChart({ bars, max, empty }: { bars: Bar[]; max?: number; empty: string }) {
  const scale = max ?? Math.max(0, ...bars.map((bar) => bar.value));
  if (bars.length === 0 || scale <= 0) {
    return <p className="text-sm text-neutral-500">{empty}</p>;
  }
  return (
    <div className="flex flex-col gap-3">
      {bars.map((bar) => (
        <div key={bar.label}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
            <span className="text-neutral-800">{bar.label}</span>
            <span className="shrink-0 text-neutral-600">{bar.display}</span>
          </div>
          <div className="h-2 rounded-full bg-neutral-200">
            <div
              className="h-2 rounded-full bg-neutral-900"
              style={{ width: bar.value <= 0 ? "0%" : `${Math.max(2, (bar.value / scale) * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
