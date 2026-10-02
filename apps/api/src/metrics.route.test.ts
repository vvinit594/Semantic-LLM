import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { ExactCache, VectorCache, createRedisClient, exactCacheKey, type CacheRedisClient } from "@semantic-llm/cache";
import type { LLMProvider } from "@semantic-llm/llm";
import "./load-env";
import { buildApp } from "./app";
import { RequestMetrics, type LatencySample, type MetricsRecorder } from "./metrics";
import { embeddingText } from "@semantic-llm/query";
import { HashEmbeddings } from "./test-vectors";

class FakeLlm implements LLMProvider {
  readonly name = "fake";
  readonly calls: string[] = [];

  async complete(prompt: string): Promise<string> {
    this.calls.push(prompt);
    return `stored:${prompt}`;
  }
}

class ThrowingMetrics implements MetricsRecorder {
  record(_sample: LatencySample): void {
    throw new Error("metrics failed");
  }

  snapshot() {
    return new RequestMetrics().snapshot();
  }
}

const redisUrl = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";
let redis: CacheRedisClient;

before(async () => {
  redis = createRedisClient(redisUrl);
  redis.on("error", () => {});
  await redis.connect();
});

after(async () => {
  if (redis?.isOpen) {
    await redis.quit();
  }
});

test("GET /api/metrics reports the miss and the following hit", async () => {
  const llm = new FakeLlm();
  const metrics = new RequestMetrics();
  const model = `metrics-${crypto.randomUUID()}`;
  const message = `metrics ${model}`;
  const embeddings = new HashEmbeddings();
  const vectors = new VectorCache(redis);
  const app = buildApp({
    llm,
    cache: new ExactCache(redis, 60),
    vectors,
    embeddings,
    redis,
    model,
    ttlSeconds: 60,
    metrics,
    logger: false,
    closeRedis: false,
  });

  try {
    const invalid = await app.inject({
      method: "POST",
      url: "/api/chat",
      payload: { message: "   " },
    });
    const first = await app.inject({
      method: "POST",
      url: "/api/chat",
      payload: { message },
    });
    const second = await app.inject({
      method: "POST",
      url: "/api/chat",
      payload: { message },
    });
    const report = await app.inject({ method: "GET", url: "/api/metrics" });
    const body = report.json();

    assert.equal(invalid.statusCode, 400);
    assert.equal(first.json().cached, false);
    assert.equal(second.json().cached, true);
    assert.equal(report.statusCode, 200);
    assert.equal(body.totalRequests, 2);
    assert.equal(body.cacheHits, 1);
    assert.equal(body.cacheMisses, 1);
    assert.equal(body.hitRate, 0.5);
    assert.equal(body.llmCalls, 1);
    assert.equal(body.llmCallsAvoided, 1);
    assert.equal(llm.calls.length, 1);
    assert.ok(body.averageLatencyMs.total >= 0);
    assert.ok(body.averageLatencyMs.cache >= 0);
    assert.ok(body.averageLatencyMs.llm >= 0);
    assert.equal(JSON.stringify(body).includes(message), false);
  } finally {
    await redis.del(exactCacheKey(message, `fake:${model}`));
    const candidates = await vectors.search(await embeddings.embed(embeddingText(message)), 8);
    for (const candidate of candidates) {
      if (candidate.record.query === message) {
        await vectors.delete(candidate.id);
      }
    }
    await app.close();
  }
});

test("a metrics failure still returns the chat answer", async () => {
  const llm = new FakeLlm();
  const model = `metrics-fail-${crypto.randomUUID()}`;
  const message = `fallback ${model}`;
  const embeddings = new HashEmbeddings();
  const vectors = new VectorCache(redis);
  const app = buildApp({
    llm,
    cache: new ExactCache(redis, 60),
    vectors,
    embeddings,
    redis,
    model,
    ttlSeconds: 60,
    metrics: new ThrowingMetrics(),
    logger: false,
    closeRedis: false,
  });

  try {
    const response = await app.inject({
      method: "POST",
      url: "/api/chat",
      payload: { message },
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), {
      answer: `stored:${message}`,
      cached: false,
      match: null,
      similarity: null,
      matchedQuery: null,
    });
  } finally {
    await redis.del(exactCacheKey(message, `fake:${model}`));
    const candidates = await vectors.search(await embeddings.embed(embeddingText(message)), 8);
    for (const candidate of candidates) {
      if (candidate.record.query === message) {
        await vectors.delete(candidate.id);
      }
    }
    await app.close();
  }
});
