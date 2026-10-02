import assert from "node:assert/strict";
import { test } from "node:test";
import { benchmarkResult, cacheResult, chatResult, metricsResult, type BenchmarkDashboard, type CachePage, type MetricsSnapshot } from "./api-responses";

const chatReply = {
  answer: "Paris is the capital of France.",
  cached: true,
  match: "exact" as const,
  similarity: 1,
  matchedQuery: "What is the capital of France?",
};

test("chat responses keep a valid reply and surface provider errors", () => {
  const hit = chatResult(true, chatReply);
  const semantic = chatResult(true, { ...chatReply, cached: false, match: "semantic", similarity: 0.91 });
  const miss = chatResult(true, { ...chatReply, cached: false, match: null, similarity: null, matchedQuery: null });
  const limited = chatResult(false, { error: "The model is rate limited. Please try again in a moment." });
  const unavailable = chatResult(false, { error: "The model is temporarily unavailable. Please try again in a moment." });
  const blank = chatResult(false, { error: "   " });
  const unexpected = chatResult(true, { answer: "Paris" });

  assert.equal(hit.ok, true);
  assert.equal(semantic.ok, true);
  assert.equal(miss.ok, true);
  if (hit.ok) {
    assert.equal(hit.reply.match, "exact");
  }
  assert.deepEqual(limited, { ok: false, error: "The model is rate limited. Please try again in a moment." });
  assert.deepEqual(unavailable, { ok: false, error: "The model is temporarily unavailable. Please try again in a moment." });
  assert.deepEqual(blank, { ok: false, error: "The request failed." });
  assert.deepEqual(unexpected, { ok: false, error: "The API returned an unexpected response." });
});

test("metrics and benchmark bodies are accepted only when the dashboard fields are present", () => {
  const metrics = metricsResult(true, metricsFixture());
  const broken = metricsResult(true, { ...metricsFixture(), exactHits: Number.NaN });
  const failed = metricsResult(false, { error: "The metrics request failed." });
  const benchmark = benchmarkResult(200, benchmarkFixture());
  const missing = benchmarkResult(404, { error: "No benchmark report is available." });
  const invalid = benchmarkResult(500, { error: "The benchmark report is not valid JSON." });
  const shapeless = benchmarkResult(200, { generatedAt: "now" });

  assert.equal(metrics.ok, true);
  assert.deepEqual(broken, { ok: false, error: "The metrics request failed." });
  assert.deepEqual(failed, { ok: false, error: "The metrics request failed." });
  assert.equal(benchmark.ok, true);
  assert.deepEqual(missing, { ok: false, missing: true });
  assert.deepEqual(invalid, { ok: false, missing: false, error: "The benchmark report is not valid JSON." });
  assert.deepEqual(shapeless, { ok: false, missing: false, error: "The benchmark request failed." });
});

test("cache pages require an entry list and string metadata", () => {
  const page = cacheResult(true, cacheFixture());
  const badMetadata = cacheResult(true, {
    ...cacheFixture(),
    entries: [{ ...cacheFixture().entries[0], metadata: { scope: 1 } }],
  });
  const unavailable = cacheResult(false, { error: "The cache is not available." });

  assert.equal(page.ok, true);
  if (page.ok) {
    assert.equal(page.page.entries[0]?.type, "semantic");
  }
  assert.deepEqual(badMetadata, { ok: false, error: "The cache request failed." });
  assert.deepEqual(unavailable, { ok: false, error: "The cache is not available." });
});

function metricsFixture(): MetricsSnapshot {
  return {
    totalRequests: 2,
    cacheHits: 1,
    cacheMisses: 1,
    exactHits: 1,
    semanticHits: 0,
    hitRate: 0.5,
    llmCalls: 1,
    llmCallsAvoided: 1,
    averageLatencyMs: { hit: 4, miss: 20, embedding: 3, redis: 2, llm: 15 },
    missReasons: [{ reason: "guard", guard: "entity", count: 1 }],
    cost: { averageCacheHitUsd: 0.000001, averageLlmRequestUsd: 0.0002, savingsUsd: 0.0002, ratio: 200 },
  };
}

function benchmarkFixture(): BenchmarkDashboard {
  return {
    generatedAt: "2026-10-02T10:18:10.815Z",
    cases: 2,
    embeddingModel: "all-MiniLM-L6-v2",
    productionThreshold: 0.85,
    productionThresholdChanged: false,
    hitRate: 0.5,
    correctHitRate: 1,
    falseHits: 0,
    falseMisses: 1,
    categories: [{ category: "paraphrase", cases: 2, hitRate: 0.5, falseHits: 0, falseMisses: 1 }],
    thresholds: [{ threshold: 0.85, hitRate: 0.5, correctHitRate: 1, falseHits: 0, falseMisses: 1 }],
    costRatio: 200,
    averageCacheHitUsd: 0.000001,
    averageLlmRequestUsd: 0.0002,
  };
}

function cacheFixture(): CachePage {
  return {
    total: 1,
    truncated: false,
    entries: [
      {
        id: "entry",
        type: "semantic",
        query: "What is a computer?",
        answer: "A machine.",
        answerTruncated: false,
        model: "gemini:gemini-3.8-flash",
        language: "und",
        scope: "public",
        createdAt: "2026-10-02T00:00:00.000Z",
        expiresAt: "2026-10-03T00:00:00.000Z",
        metadata: { scope: "public" },
      },
    ],
  };
}
