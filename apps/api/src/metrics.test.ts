import assert from "node:assert/strict";
import { test } from "node:test";
import { RequestMetrics, type LatencySample } from "./metrics";

test("an empty snapshot is zero", () => {
  assert.deepEqual(new RequestMetrics().snapshot(), {
    totalRequests: 0,
    cacheHits: 0,
    cacheMisses: 0,
    hitRate: 0,
    llmCalls: 0,
    llmCallsAvoided: 0,
    averageLatencyMs: { total: 0, cache: 0, llm: 0 },
  });
});

test("a miss then a hit records calls avoided and average latency", () => {
  const metrics = new RequestMetrics();
  metrics.record(sample({ outcome: "miss", llmCalled: true, totalMs: 100, cacheMs: 10, llmMs: 80 }));
  metrics.record(sample({ outcome: "hit", llmCalled: false, totalMs: 20, cacheMs: 4, llmMs: 0 }));

  assert.deepEqual(metrics.snapshot(), {
    totalRequests: 2,
    cacheHits: 1,
    cacheMisses: 1,
    hitRate: 0.5,
    llmCalls: 1,
    llmCallsAvoided: 1,
    averageLatencyMs: { total: 60, cache: 7, llm: 80 },
  });
});

test("a sample with a bad duration is ignored", () => {
  const metrics = new RequestMetrics();
  metrics.record(sample({ outcome: "miss", llmCalled: true, totalMs: Number.NaN, cacheMs: 1, llmMs: 1 }));
  metrics.record(sample({ outcome: "hit", llmCalled: false, totalMs: 1, cacheMs: -1, llmMs: 0 }));

  assert.equal(metrics.snapshot().totalRequests, 0);
});

function sample(overrides: LatencySample): LatencySample {
  return overrides;
}
