import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import {
  ExactCache,
  VectorCache,
  createRedisClient,
  exactCacheKey,
  vectorCacheKey,
  type CacheRedisClient,
} from "@semantic-llm/cache";
import type { EmbeddingService } from "@semantic-llm/embeddings";
import { MissingGeminiApiKeyError, type LLMProvider } from "@semantic-llm/llm";
import { embeddingText } from "@semantic-llm/query";
import { EMBEDDING_DIMENSIONS } from "@semantic-llm/shared";
import "./load-env";
import { buildApp } from "./app";
import { HashEmbeddings, unitEmbedding } from "./test-vectors";

class FakeLlm implements LLMProvider {
  readonly name = "fake";
  readonly calls: string[] = [];

  async complete(prompt: string): Promise<string> {
    this.calls.push(prompt);
    return `stored:${prompt}`;
  }
}

class MissingKeyLlm implements LLMProvider {
  readonly name = "fake";

  async complete(): Promise<string> {
    throw new MissingGeminiApiKeyError();
  }
}

class ThrowingGetCache extends ExactCache {
  override async get(): Promise<{ query: string; answer: string } | undefined> {
    throw new Error("redis read failed");
  }
}

class MappedEmbeddings implements EmbeddingService {
  readonly model = "fake";
  readonly dimensions = EMBEDDING_DIMENSIONS;

  constructor(private readonly vectors: Map<string, number[]>) {}

  async init(): Promise<void> {}

  async embed(text: string): Promise<number[]> {
    const direct = this.vectors.get(text);
    if (direct) {
      return direct;
    }
    for (const [key, vector] of this.vectors) {
      if (embeddingText(key) === text) {
        return vector;
      }
    }
    throw new Error(`no test vector for ${text}`);
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

test("malformed chat bodies are rejected", async () => {
  const app = buildApp(appOptions(new FakeLlm(), new ExactCache(redis, 60), new VectorCache(redis), new HashEmbeddings()));
  try {
    const bodies = [{}, { message: 1 }, { message: "   " }, { message: "x".repeat(8_001) }];
    for (const payload of bodies) {
      const response = await app.inject({ method: "POST", url: "/api/chat", payload });
      assert.equal(response.statusCode, 400);
      assert.equal(response.json().error, "message must be a non-empty string up to 8000 characters");
    }
  } finally {
    await app.close();
  }
});

test("a missing Gemini key returns 503 and stores nothing", async () => {
  const model = `missing-key-${crypto.randomUUID()}`;
  const message = `missing key ${model}`;
  const cache = new ExactCache(redis, 60);
  const app = buildApp({
    ...appOptions(new MissingKeyLlm(), cache, new VectorCache(redis), new HashEmbeddings()),
    model,
  });

  try {
    const response = await app.inject({ method: "POST", url: "/api/chat", payload: { message } });
    assert.equal(response.statusCode, 503);
    assert.deepEqual(response.json(), { error: "GEMINI_API_KEY is not set" });
    assert.equal(await cache.get(message, `fake:${model}`), undefined);
  } finally {
    await redis.del(exactCacheKey(message, `fake:${model}`));
    await app.close();
  }
});

test("an exact-cache read failure still returns the model answer", async () => {
  const llm = new FakeLlm();
  const model = `throwing-get-${crypto.randomUUID()}`;
  const message = `throwing get ${model}`;
  const embeddings = new HashEmbeddings();
  const vectors = new VectorCache(redis);
  const app = buildApp({
    ...appOptions(llm, new ThrowingGetCache(redis, 60), vectors, embeddings),
    model,
  });
  const followUp = buildApp({
    ...appOptions(llm, new ExactCache(redis, 60), vectors, embeddings),
    model,
  });

  try {
    const failedRead = await app.inject({ method: "POST", url: "/api/chat", payload: { message } });
    const stored = await followUp.inject({ method: "POST", url: "/api/chat", payload: { message } });

    assert.equal(failedRead.statusCode, 200);
    assert.equal(failedRead.json().cached, false);
    assert.equal(failedRead.json().answer, `stored:${message}`);
    assert.equal(stored.json().cached, true);
    assert.equal(stored.json().match, "exact");
    assert.deepEqual(llm.calls, [message]);
  } finally {
    await redis.del(exactCacheKey(message, `fake:${model}`));
    await removeSemantic(vectors, embeddings, [message]);
    await app.close();
    await followUp.close();
  }
});

test("Redis being down leaves chat available and marks health degraded", async () => {
  const llm = new FakeLlm();
  const down = unavailableRedis();
  const message = `redis down ${crypto.randomUUID()}`;
  const app = buildApp(appOptions(llm, new ExactCache(down, 60), new VectorCache(down), new HashEmbeddings(), down));

  try {
    const health = await app.inject({ method: "GET", url: "/health" });
    const chat = await app.inject({ method: "POST", url: "/api/chat", payload: { message } });
    const explorer = await app.inject({ method: "GET", url: "/api/cache" });

    assert.equal(health.statusCode, 200);
    assert.equal(health.json().status, "degraded");
    assert.equal(health.json().redis, "error");
    assert.equal(chat.statusCode, 200);
    assert.equal(chat.json().cached, false);
    assert.equal(chat.json().answer, `stored:${message}`);
    assert.equal(explorer.statusCode, 503);
    assert.deepEqual(explorer.json(), { error: "The cache is not available." });
  } finally {
    await app.close();
  }
});

test("a stale semantic neighbor is not reused", async () => {
  const llm = new FakeLlm();
  const model = `stale-${crypto.randomUUID()}`;
  const cached = `stale cached ${model}`;
  const asked = `stale asked ${model}`;
  const vector = unitEmbedding(300);
  const vectors = new VectorCache(redis);
  const stored = await vectors.upsert({
    id: `stale-${crypto.randomUUID()}`,
    query: cached,
    embedding: vector,
    response: "stale answer",
    model: `fake:${model}`,
    language: "und",
    ttlSeconds: 120,
    metadata: { scope: "public" },
  });
  stored.expiresAt = new Date(Date.now() - 60_000).toISOString();
  await redis.json.set(vectorCacheKey(stored.id), "$", stored);
  const app = buildApp({
    ...appOptions(llm, new ExactCache(redis, 60), vectors, new MappedEmbeddings(new Map([[asked, vector], [cached, vector]]))),
    model,
  });

  try {
    const response = await app.inject({ method: "POST", url: "/api/chat", payload: { message: asked } });
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().cached, false);
    assert.equal(response.json().match, null);
    assert.equal(response.json().answer, `stored:${asked}`);
  } finally {
    await redis.del(exactCacheKey(asked, `fake:${model}`));
    await vectors.delete(stored.id);
    await removeSemantic(vectors, new MappedEmbeddings(new Map([[asked, vector]])), [asked]);
    await app.close();
  }
});

test("language and scope mismatches do not reuse a similar answer", async () => {
  const llm = new FakeLlm();
  const model = `metadata-${crypto.randomUUID()}`;
  const french = `french ${model}`;
  const frenchAsk = `french ask ${model}`;
  const privateQuery = `private ${model}`;
  const privateAsk = `private ask ${model}`;
  const frenchVector = unitEmbedding(301);
  const privateVector = unitEmbedding(302);
  const vectors = new VectorCache(redis);
  const frenchId = `lang-${crypto.randomUUID()}`;
  const privateId = `scope-${crypto.randomUUID()}`;
  await vectors.upsert({
    id: frenchId,
    query: french,
    embedding: frenchVector,
    response: "french answer",
    model: `fake:${model}`,
    language: "fr",
    ttlSeconds: 120,
    metadata: { scope: "public" },
  });
  await vectors.upsert({
    id: privateId,
    query: privateQuery,
    embedding: privateVector,
    response: "private answer",
    model: `fake:${model}`,
    language: "und",
    ttlSeconds: 120,
    metadata: { scope: "private" },
  });
  const embeddings = new MappedEmbeddings(new Map([
    [french, frenchVector],
    [frenchAsk, frenchVector],
    [privateQuery, privateVector],
    [privateAsk, privateVector],
  ]));
  const app = buildApp({
    ...appOptions(llm, new ExactCache(redis, 60), vectors, embeddings),
    model,
  });

  try {
    const language = await app.inject({ method: "POST", url: "/api/chat", payload: { message: frenchAsk } });
    const scope = await app.inject({ method: "POST", url: "/api/chat", payload: { message: privateAsk } });

    assert.equal(language.json().cached, false);
    assert.equal(language.json().answer, `stored:${frenchAsk}`);
    assert.equal(scope.json().cached, false);
    assert.equal(scope.json().answer, `stored:${privateAsk}`);
    assert.deepEqual(llm.calls, [frenchAsk, privateAsk]);
  } finally {
    await redis.del(exactCacheKey(frenchAsk, `fake:${model}`));
    await redis.del(exactCacheKey(privateAsk, `fake:${model}`));
    await vectors.delete(frenchId);
    await vectors.delete(privateId);
    await removeSemantic(vectors, embeddings, [frenchAsk, privateAsk]);
    await app.close();
  }
});

test("a healthy Redis ping reports ok", async () => {
  const app = buildApp(appOptions(new FakeLlm(), new ExactCache(redis, 60), new VectorCache(redis), new HashEmbeddings()));
  try {
    const health = await app.inject({ method: "GET", url: "/health" });
    assert.equal(health.statusCode, 200);
    assert.equal(health.json().status, "ok");
    assert.equal(health.json().redis, "ok");
  } finally {
    await app.close();
  }
});

function appOptions(
  llm: LLMProvider,
  cache: ExactCache,
  vectors: VectorCache,
  embeddings: EmbeddingService,
  client: CacheRedisClient = redis,
) {
  return {
    llm,
    cache,
    vectors,
    embeddings,
    redis: client,
    model: "hardening",
    ttlSeconds: 60,
    logger: false as const,
    closeRedis: false,
  };
}

function unavailableRedis(): CacheRedisClient {
  return {
    isReady: false,
    isOpen: false,
    async quit() {},
    async ping() {
      throw new Error("redis down");
    },
    ft: {
      async create() {
        throw new Error("redis down");
      },
      async search() {
        throw new Error("redis down");
      },
    },
  } as unknown as CacheRedisClient;
}

async function removeSemantic(vectors: VectorCache, embeddings: EmbeddingService, queries: string[]): Promise<void> {
  for (const query of queries) {
    const candidates = await vectors.search(await embeddings.embed(embeddingText(query)), 8);
    for (const candidate of candidates) {
      if (queries.includes(candidate.record.query)) {
        await vectors.delete(candidate.id);
      }
    }
  }
}
