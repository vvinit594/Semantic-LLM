import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import {
  ExactCache,
  VectorCache,
  createRedisClient,
  exactCacheKey,
  type CacheRedisClient,
} from "@semantic-llm/cache";
import { createLocalEmbeddingService, type EmbeddingService } from "@semantic-llm/embeddings";
import { embeddingText } from "@semantic-llm/query";
import type { LLMProvider } from "@semantic-llm/llm";
import "./load-env";
import { buildApp } from "./app";
import { DEFAULT_SIMILARITY_THRESHOLD } from "./semantic-cache";

class FakeLlm implements LLMProvider {
  readonly name = "fake";
  readonly calls: string[] = [];

  async complete(prompt: string): Promise<string> {
    this.calls.push(prompt);
    return `stored:${prompt}`;
  }
}

const france = "What is the capital of France?";
const franceParaphrase = "Which city is the capital of France?";
const pasta = "How do I boil pasta?";
const queries = [france, franceParaphrase, pasta];

const redisUrl = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";
let redis: CacheRedisClient;
let embeddings: EmbeddingService;
let vectors: VectorCache;

before(async () => {
  redis = createRedisClient(redisUrl);
  redis.on("error", () => {});
  await redis.connect();
  embeddings = createLocalEmbeddingService();
  await embeddings.init();
  vectors = new VectorCache(redis);
  await removeQueries(vectors, embeddings, queries);
});

after(async () => {
  if (embeddings && vectors) {
    await removeQueries(vectors, embeddings, queries);
  }
  if (redis?.isOpen) {
    await redis.quit();
  }
});

test("a real paraphrase hits above the threshold and an unrelated question misses", async () => {
  const llm = new FakeLlm();
  const model = `live-${crypto.randomUUID()}`;
  const app = buildApp({
    llm,
    cache: new ExactCache(redis, 60),
    vectors,
    embeddings,
    redis,
    model,
    ttlSeconds: 60,
    similarityThreshold: DEFAULT_SIMILARITY_THRESHOLD,
    logger: false,
    closeRedis: false,
  });

  try {
    const first = await app.inject({ method: "POST", url: "/api/chat", payload: { message: france } });
    const paraphrase = await app.inject({
      method: "POST",
      url: "/api/chat",
      payload: { message: franceParaphrase },
    });
    const unrelated = await app.inject({ method: "POST", url: "/api/chat", payload: { message: pasta } });

    assert.equal(first.statusCode, 200);
    assert.deepEqual(first.json(), { answer: `stored:${france}`, cached: false });
    assert.deepEqual(paraphrase.json(), { answer: `stored:${france}`, cached: true });
    assert.deepEqual(unrelated.json(), { answer: `stored:${pasta}`, cached: false });
    assert.deepEqual(llm.calls, [france, pasta]);
  } finally {
    for (const query of queries) {
      await redis.del(exactCacheKey(query, `fake:${model}`));
    }
    await app.close();
  }
});

async function removeQueries(
  cache: VectorCache,
  embeddingService: EmbeddingService,
  storedQueries: string[],
): Promise<void> {
  for (const query of storedQueries) {
    const candidates = await cache.search(await embeddingService.embed(embeddingText(query)), 10);
    for (const candidate of candidates) {
      if (storedQueries.includes(candidate.record.query)) {
        await cache.delete(candidate.id);
      }
    }
  }
}
