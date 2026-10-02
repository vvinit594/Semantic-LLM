import assert from "node:assert/strict";
import { test } from "node:test";
import { VectorCache, createRedisClient } from "@semantic-llm/cache";
import { createLocalEmbeddingService } from "@semantic-llm/embeddings";
import {
  DEFAULT_COST_RATES,
  LOCAL_COMPUTE_USD_PER_HOUR,
  costRatio,
  quoteCosts,
} from "@semantic-llm/evaluation";
import { DEFAULT_GEMINI_MODEL, GeminiProvider } from "@semantic-llm/llm";
import { embeddingText } from "@semantic-llm/query";
import "./load-env";

const QUERY = "What is the capital of France?";
const SAMPLES = 5;

/**
 * One Gemini 3.8 Flash call on 2026-10-02 for "Reply with the single word Paris."
 * Set MEASURE_LLM_COST=1 to replace these counts with a new call.
 */
const MEASURED_LLM_INPUT_TOKENS = 8;
const MEASURED_LLM_OUTPUT_TOKENS = 64;

test("a warm local hit stays far cheaper than the measured Gemini request", async () => {
  const embeddings = createLocalEmbeddingService();
  await embeddings.init();
  const text = embeddingText(QUERY);
  await embeddings.embed(text);

  const embeddingMs = await medianMs(SAMPLES, () => embeddings.embed(text));
  const redisUrl = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";
  const redis = createRedisClient(redisUrl);
  redis.on("error", () => {});
  await redis.connect();

  try {
    const vectors = new VectorCache(redis);
    const vector = await embeddings.embed(text);
    await vectors.search(vector, 5);
    const redisMs = await medianMs(SAMPLES, () => vectors.search(vector, 5));
    const usage = await llmUsage();
    const hit = quoteCosts({
      embeddingMs,
      redisMs,
      llmMs: 0,
      embeddingCalls: 1,
      llmInputTokens: 0,
      llmOutputTokens: 0,
    });
    const exact = quoteCosts({
      embeddingMs: 0,
      redisMs,
      llmMs: 0,
      embeddingCalls: 0,
      llmInputTokens: 0,
      llmOutputTokens: 0,
    });
    const llm = quoteCosts({
      embeddingMs: 0,
      redisMs: 0,
      llmMs: usage.llmMs,
      embeddingCalls: 0,
      llmInputTokens: usage.inputTokens,
      llmOutputTokens: usage.outputTokens,
    });
    const ratio = costRatio(hit.cacheHitUsd, llm.llmRequestUsd);

    assert.equal(hit.llmInputUsd, 0);
    assert.equal(hit.llmOutputUsd, 0);
    assert.equal(DEFAULT_COST_RATES.embeddingApiUsdPerCall, 0);
    assert.equal(hit.embeddingUsd, seconds(embeddingMs) * DEFAULT_COST_RATES.computeUsdPerSecond);
    assert.equal(exact.embeddingUsd, 0);
    assert.equal(llm.llmRequestUsd, usage.inputTokens / 1_000_000 * 0.75 + usage.outputTokens / 1_000_000 * 3.75);
    assert.equal(ratio !== null && ratio >= 100, true);

    console.log(
      JSON.stringify({
        kind: "cost-measurement",
        embeddingMs,
        redisMs,
        semanticHitUsd: hit.cacheHitUsd,
        exactHitUsd: exact.cacheHitUsd,
        llmInputTokens: usage.inputTokens,
        llmOutputTokens: usage.outputTokens,
        llmMs: usage.llmMs,
        llmRequestUsd: llm.llmRequestUsd,
        ratio,
        computeUsdPerHour: LOCAL_COMPUTE_USD_PER_HOUR,
        embeddingApiUsdPerCall: DEFAULT_COST_RATES.embeddingApiUsdPerCall,
      }),
    );
  } finally {
    if (redis.isOpen) {
      await redis.quit();
    }
  }
});

async function llmUsage(): Promise<{ inputTokens: number; outputTokens: number; llmMs: number }> {
  if (process.env.MEASURE_LLM_COST !== "1") {
    return {
      inputTokens: MEASURED_LLM_INPUT_TOKENS,
      outputTokens: MEASURED_LLM_OUTPUT_TOKENS,
      llmMs: 0,
    };
  }

  const key = process.env.GEMINI_API_KEY?.trim() ?? "";
  if (key.length === 0) {
    throw new Error("MEASURE_LLM_COST=1 requires GEMINI_API_KEY");
  }
  const model = process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL;
  const provider = new GeminiProvider(key, model);
  const started = performance.now();
  try {
    const completion = await provider.completeWithUsage("Reply with the single word Paris.");
    return {
      inputTokens: completion.inputTokens,
      outputTokens: completion.outputTokens,
      llmMs: elapsedMs(started),
    };
  } catch (error) {
    throw new Error(redact(error, key));
  }
}

async function medianMs(count: number, run: () => Promise<unknown>): Promise<number> {
  const samples: number[] = [];
  for (let index = 0; index < count; index += 1) {
    const started = performance.now();
    await run();
    samples.push(elapsedMs(started));
  }
  samples.sort((left, right) => left - right);
  return samples[Math.floor(samples.length / 2)] ?? 0;
}

function elapsedMs(started: number): number {
  const value = performance.now() - started;
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function seconds(milliseconds: number): number {
  return milliseconds / 1000;
}

function redact(error: unknown, secret: string): string {
  const message = error instanceof Error ? error.message : "LLM request failed";
  return secret ? message.replaceAll(secret, "[redacted]") : message;
}
