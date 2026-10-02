import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { ExactCache, VectorCache, createRedisClient, exactCacheKey, type CacheRedisClient } from "@semantic-llm/cache";
import type { LLMProvider } from "@semantic-llm/llm";
import { buildApp } from "./app";
import { filterCacheEntries, redactText, type CacheExplorerEntry } from "./cache-explorer";
import { HashEmbeddings } from "./test-vectors";

class FakeLlm implements LLMProvider {
  readonly name = "fake";

  async complete(): Promise<string> {
    return "unused";
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

test("search and type filters keep only matching stored entries", () => {
  const page = filterCacheEntries(
    [sample("exact", "What is the capital of France?"), sample("semantic", "How do I boil pasta?")],
    { q: "france", type: "exact" },
  );

  assert.equal(page.total, 1);
  assert.equal(page.truncated, false);
  assert.equal(page.entries[0]?.query, "What is the capital of France?");
  assert.equal(page.entries[0]?.type, "exact");
});

test("stored text that contains a secret is redacted", () => {
  const secret = "super-secret-token-value";
  assert.equal(redactText(`The key is ${secret}.`, [secret]), "The key is [redacted].");
  assert.equal(redactText("prefix AIzaSyDummyKeyValue1234567890 suffix", []), "prefix [redacted] suffix");
});

test("GET /api/cache lists exact and semantic entries without the embedding", async () => {
  const token = `explorer-${crypto.randomUUID()}`;
  const model = `fake:explorer-${crypto.randomUUID()}`;
  const exactQuery = `${token} exact question`;
  const semanticQuery = `${token} semantic question`;
  const semanticId = `explorer-${crypto.randomUUID()}`;
  const secret = "explorer-secret-token-123456";
  const previousKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = secret;
  const embeddings = new HashEmbeddings();
  const vectors = new VectorCache(redis);
  const cache = new ExactCache(redis, 60);
  const app = buildApp({
    llm: new FakeLlm(),
    cache,
    vectors,
    embeddings,
    redis,
    model: "explorer",
    ttlSeconds: 60,
    logger: false,
    closeRedis: false,
  });

  try {
    await cache.set(exactQuery, model, `exact answer ${secret}`);
    await vectors.upsert({
      id: semanticId,
      query: semanticQuery,
      embedding: await embeddings.embed(semanticQuery),
      response: `semantic answer ${token}`,
      model,
      language: "und",
      ttlSeconds: 60,
      metadata: { scope: "public" },
    });

    const all = await app.inject({ method: "GET", url: `/api/cache?q=${encodeURIComponent(token)}` });
    const exactOnly = await app.inject({
      method: "GET",
      url: `/api/cache?q=${encodeURIComponent(token)}&type=exact`,
    });
    const hiddenSecret = await app.inject({
      method: "GET",
      url: `/api/cache?q=${encodeURIComponent(secret)}`,
    });
    const invalid = await app.inject({ method: "GET", url: "/api/cache?type=nope" });
    const body = all.json() as { entries: CacheExplorerEntry[]; total: number };
    const exact = body.entries.find((entry) => entry.type === "exact");
    const semantic = body.entries.find((entry) => entry.type === "semantic");

    assert.equal(all.statusCode, 200);
    assert.equal(body.total, 2);
    assert.equal(exact?.query, exactQuery);
    assert.equal(exact?.answer, "exact answer [redacted]");
    assert.equal(exact?.model, model);
    assert.equal(exact?.language, null);
    assert.equal(exact?.scope, null);
    assert.equal(typeof exact?.createdAt, "string");
    assert.equal(typeof exact?.expiresAt, "string");
    assert.equal(semantic?.query, semanticQuery);
    assert.equal(semantic?.language, "und");
    assert.equal(semantic?.scope, "public");
    assert.deepEqual(semantic?.metadata, { scope: "public" });
    assert.equal(JSON.stringify(body).includes('"embedding"'), false);
    assert.equal(JSON.stringify(body).includes(secret), false);
    assert.equal(exactOnly.statusCode, 200);
    assert.equal(exactOnly.json().total, 1);
    assert.equal(exactOnly.json().entries[0].type, "exact");
    assert.equal(hiddenSecret.json().total, 0);
    assert.equal(invalid.statusCode, 400);
  } finally {
    if (previousKey === undefined) {
      delete process.env.GEMINI_API_KEY;
    } else {
      process.env.GEMINI_API_KEY = previousKey;
    }
    await redis.del(exactCacheKey(exactQuery, model));
    await vectors.delete(semanticId);
    await app.close();
  }
});

test("GET /api/cache rejects an oversized query and skips corrupt exact entries", async () => {
  const token = `corrupt-${crypto.randomUUID()}`;
  const key = `exact:${token}`;
  const app = buildApp({
    llm: new FakeLlm(),
    cache: new ExactCache(redis, 60),
    vectors: new VectorCache(redis),
    embeddings: new HashEmbeddings(),
    redis,
    model: "explorer",
    ttlSeconds: 60,
    logger: false,
    closeRedis: false,
  });

  try {
    await redis.set(key, "not-json", { EX: 60 });
    const oversized = await app.inject({ method: "GET", url: `/api/cache?q=${"a".repeat(201)}` });
    const listed = await app.inject({ method: "GET", url: `/api/cache?q=${token}` });

    assert.equal(oversized.statusCode, 400);
    assert.deepEqual(oversized.json(), { error: "q must be a string up to 200 characters" });
    assert.equal(listed.statusCode, 200);
    assert.equal(listed.json().total, 0);
  } finally {
    await redis.del(key);
    await app.close();
  }
});

function sample(type: CacheExplorerEntry["type"], query: string): CacheExplorerEntry {
  return {
    id: query,
    type,
    query,
    answer: "answer",
    answerTruncated: false,
    model: "fake:test",
    language: type === "semantic" ? "und" : null,
    scope: type === "semantic" ? "public" : null,
    createdAt: "2026-10-02T00:00:00.000Z",
    expiresAt: "2026-10-03T00:00:00.000Z",
    metadata: {},
  };
}
