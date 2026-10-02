import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_COST_RATES, costRatio, quoteCosts } from "./cost";

test("a cache hit bills local compute only and the ratio uses the LLM token price", () => {
  const hit = quoteCosts({
    embeddingMs: 1000,
    redisMs: 0,
    llmMs: 0,
    embeddingCalls: 1,
    llmInputTokens: 0,
    llmOutputTokens: 0,
  });
  const llm = quoteCosts({
    embeddingMs: 0,
    redisMs: 0,
    llmMs: 0,
    embeddingCalls: 0,
    llmInputTokens: 1_000_000,
    llmOutputTokens: 0,
  });

  assert.equal(hit.embeddingUsd, DEFAULT_COST_RATES.computeUsdPerSecond);
  assert.equal(hit.llmInputUsd, 0);
  assert.equal(hit.llmOutputUsd, 0);
  assert.equal(hit.cacheHitUsd, DEFAULT_COST_RATES.computeUsdPerSecond);
  assert.equal(llm.llmInputUsd, 0.75);
  assert.equal(llm.llmRequestUsd, 0.75);
  assert.equal(costRatio(hit.cacheHitUsd, llm.llmRequestUsd), 0.75 / DEFAULT_COST_RATES.computeUsdPerSecond);
});

test("an exact hit does not add an embedding API charge", () => {
  const exact = quoteCosts({
    embeddingMs: 0,
    redisMs: 1000,
    llmMs: 0,
    embeddingCalls: 0,
    llmInputTokens: 0,
    llmOutputTokens: 0,
  });

  assert.equal(exact.embeddingUsd, 0);
  assert.equal(exact.redisUsd, DEFAULT_COST_RATES.computeUsdPerSecond);
  assert.equal(exact.cacheHitUsd, exact.redisUsd);
});

test("LLM wall time is recorded separately from the token bill", () => {
  const billed = quoteCosts({
    embeddingMs: 0,
    redisMs: 0,
    llmMs: 10_000,
    embeddingCalls: 0,
    llmInputTokens: 1_000_000,
    llmOutputTokens: 0,
  });

  assert.equal(billed.llmRequestUsd, 0.75);
  assert.ok(billed.llmComputeUsd > 0);
});

test("a zero hit cost does not invent a ratio", () => {
  assert.equal(costRatio(0, 0.75), null);
});
