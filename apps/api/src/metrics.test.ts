import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_COST_RATES, costRatio, quoteCosts } from "@semantic-llm/evaluation";
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
    cost: {
      embeddingUsd: 0,
      redisUsd: 0,
      llmInputUsd: 0,
      llmOutputUsd: 0,
      cacheHitUsd: 0,
      llmRequestUsd: 0,
      ratio: null,
    },
  });
});

test("a miss then a hit records calls avoided and average latency", () => {
  const metrics = new RequestMetrics();
  const miss = sample({
    outcome: "miss",
    llmCalled: true,
    totalMs: 100,
    cacheMs: 10,
    llmMs: 80,
    redisMs: 10,
    llmInputTokens: 1_000_000,
    llmOutputTokens: 0,
  });
  const hit = sample({
    outcome: "hit",
    llmCalled: false,
    totalMs: 20,
    cacheMs: 4,
    llmMs: 0,
    embeddingMs: 4,
    embeddingCalls: 1,
    llmInputTokens: 1_000_000,
  });
  metrics.record(miss);
  metrics.record(hit);

  const missQuote = quoteCosts(miss, DEFAULT_COST_RATES);
  const hitQuote = quoteCosts(
    { ...hit, llmMs: 0, llmInputTokens: 0, llmOutputTokens: 0 },
    DEFAULT_COST_RATES,
  );

  assert.deepEqual(metrics.snapshot(), {
    totalRequests: 2,
    cacheHits: 1,
    cacheMisses: 1,
    hitRate: 0.5,
    llmCalls: 1,
    llmCallsAvoided: 1,
    averageLatencyMs: { total: 60, cache: 7, llm: 80 },
    cost: {
      embeddingUsd: missQuote.embeddingUsd + hitQuote.embeddingUsd,
      redisUsd: missQuote.redisUsd + hitQuote.redisUsd,
      llmInputUsd: missQuote.llmInputUsd,
      llmOutputUsd: missQuote.llmOutputUsd,
      cacheHitUsd: hitQuote.cacheHitUsd,
      llmRequestUsd: missQuote.llmRequestUsd,
      ratio: costRatio(hitQuote.cacheHitUsd, missQuote.llmRequestUsd),
    },
  });
});

test("a hit does not bill LLM tokens", () => {
  const metrics = new RequestMetrics();
  metrics.record(
    sample({
      outcome: "hit",
      llmCalled: false,
      totalMs: 4,
      cacheMs: 4,
      llmMs: 0,
      redisMs: 4,
      llmInputTokens: 1_000_000,
      llmOutputTokens: 1_000_000,
    }),
  );

  const snapshot = metrics.snapshot();
  assert.equal(snapshot.cost.llmInputUsd, 0);
  assert.equal(snapshot.cost.llmOutputUsd, 0);
  assert.equal(snapshot.cost.llmRequestUsd, 0);
  assert.equal(snapshot.cost.ratio, null);
});

test("a sample with a bad duration is ignored", () => {
  const metrics = new RequestMetrics();
  metrics.record(sample({ outcome: "miss", llmCalled: true, totalMs: Number.NaN, cacheMs: 1, llmMs: 1 }));
  metrics.record(sample({ outcome: "hit", llmCalled: false, totalMs: 1, cacheMs: -1, llmMs: 0 }));

  assert.equal(metrics.snapshot().totalRequests, 0);
});

function sample(overrides: Partial<LatencySample> & Pick<LatencySample, "outcome" | "llmCalled" | "totalMs" | "cacheMs" | "llmMs">): LatencySample {
  return {
    embeddingMs: 0,
    redisMs: 0,
    embeddingCalls: 0,
    llmInputTokens: 0,
    llmOutputTokens: 0,
    ...overrides,
  };
}
