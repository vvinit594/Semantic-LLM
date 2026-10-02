import type { LoadMode, ScenarioName } from "./plan";

export type LoadObservation = {
  ok: boolean;
  cached: boolean | null;
  match: "exact" | "semantic" | null;
};

export type LoadSample = LoadObservation & {
  kind: "chat" | "health";
  latencyMs: number;
};

export type ScenarioReport = {
  scenario: ScenarioName;
  mode: LoadMode;
  concurrency: number;
  completed: number;
  errors: number;
  errorRate: number | null;
  elapsedMs: number;
  requestsPerSecond: number | null;
  throughputPerSecond: number | null;
  latencyMs: { p50: number | null; p95: number | null; p99: number | null };
  chatRequests: number;
  exactHits: number;
  semanticHits: number;
  misses: number;
  hitRate: number | null;
  llmCalls: number;
  llmCallsAvoided: number;
  warmupLlmCalls: number;
  stoppedEarly: boolean;
};

export function percentile(values: readonly number[], percent: number): number | null {
  if (values.length === 0 || !Number.isFinite(percent)) {
    return null;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const rank = Math.ceil((percent / 100) * sorted.length);
  const index = Math.min(sorted.length, Math.max(1, rank)) - 1;
  return sorted[index] ?? null;
}

export function summarize(input: {
  scenario: ScenarioName;
  mode: LoadMode;
  concurrency: number;
  samples: readonly LoadSample[];
  elapsedMs: number;
  warmupLlmCalls: number;
  measuredLlmCalls: number;
  stoppedEarly: boolean;
}): ScenarioReport {
  const latencies = input.samples.map((sample) => sample.latencyMs);
  const errors = input.samples.filter((sample) => !sample.ok).length;
  const chat = input.samples.filter((sample) => sample.kind === "chat" && sample.ok);
  const exactHits = chat.filter((sample) => sample.cached === true && sample.match === "exact").length;
  const semanticHits = chat.filter((sample) => sample.cached === true && sample.match === "semantic").length;
  const hits = chat.filter((sample) => sample.cached === true).length;
  const misses = chat.filter((sample) => sample.cached === false).length;
  const completed = input.samples.length;
  const requestsPerSecond = input.elapsedMs > 0 ? completed / (input.elapsedMs / 1_000) : null;
  return {
    scenario: input.scenario,
    mode: input.mode,
    concurrency: input.concurrency,
    completed,
    errors,
    errorRate: completed > 0 ? errors / completed : null,
    elapsedMs: input.elapsedMs,
    requestsPerSecond,
    throughputPerSecond: requestsPerSecond,
    latencyMs: {
      p50: percentile(latencies, 50),
      p95: percentile(latencies, 95),
      p99: percentile(latencies, 99),
    },
    chatRequests: chat.length,
    exactHits,
    semanticHits,
    misses,
    hitRate: chat.length > 0 ? hits / chat.length : null,
    llmCalls: input.warmupLlmCalls + input.measuredLlmCalls,
    llmCallsAvoided: hits,
    warmupLlmCalls: input.warmupLlmCalls,
    stoppedEarly: input.stoppedEarly,
  };
}
