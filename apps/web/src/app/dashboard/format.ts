export function formatCount(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

export function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export function formatMs(value: number): string {
  if (value >= 100) {
    return `${value.toFixed(0)} ms`;
  }
  return `${value.toFixed(1)} ms`;
}

export function formatUsd(value: number | null): string {
  if (value === null) {
    return "—";
  }
  if (value === 0) {
    return "$0";
  }
  if (value >= 0.01) {
    return `$${value.toFixed(4)}`;
  }
  return `$${value.toPrecision(3)}`;
}

export function formatRatio(value: number | null): string {
  if (value === null) {
    return "—";
  }
  if (value >= 100) {
    return value.toFixed(0);
  }
  return value.toFixed(1);
}

export function formatCategory(category: string): string {
  return category.replaceAll("-", " ");
}
