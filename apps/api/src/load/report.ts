import type { ScenarioReport } from "./stats";

export function formatReport(report: ScenarioReport): string {
  const lines = [
    `${report.scenario} (${report.mode})`,
    `Completed: ${report.completed}    Errors: ${report.errors}    Error rate: ${formatRate(report.errorRate)}`,
    `Requests per second: ${formatNumber(report.requestsPerSecond)}    Elapsed: ${formatMs(report.elapsedMs)}`,
    `Latency p50/p95/p99: ${formatMs(report.latencyMs.p50)} / ${formatMs(report.latencyMs.p95)} / ${formatMs(report.latencyMs.p99)}`,
    `Cache hit rate: ${formatRate(report.hitRate)}    Exact hits: ${report.exactHits}    Semantic hits: ${report.semanticHits}    Misses: ${report.misses}`,
    `LLM calls: ${report.llmCalls} (${report.warmupLlmCalls} during warmup)    LLM calls avoided: ${report.llmCallsAvoided}`,
  ];
  if (report.stoppedEarly) {
    lines.push("Stopped early because the live Gemini call ceiling was reached.");
  }
  return lines.join("\n");
}

function formatRate(value: number | null): string {
  if (value === null) {
    return "n/a";
  }
  return `${(value * 100).toFixed(1)}%`;
}

function formatNumber(value: number | null): string {
  if (value === null) {
    return "n/a";
  }
  return value.toFixed(1);
}

function formatMs(value: number | null): string {
  if (value === null) {
    return "n/a";
  }
  return `${value.toFixed(1)} ms`;
}
