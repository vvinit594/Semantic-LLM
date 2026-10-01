import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { EMBEDDING_DIMENSIONS } from "@semantic-llm/shared";
import { createRedisClient, type CacheRedisClient } from "./redis";
import { VectorCache, VectorCacheError } from "./vector";

let redis: CacheRedisClient;
let cache: VectorCache;

before(async () => {
  redis = createRedisClient(process.env.REDIS_URL ?? "redis://127.0.0.1:6379");
  redis.on("error", () => {});
  await redis.connect();
  cache = new VectorCache(redis);
});

after(async () => {
  if (redis?.isOpen) {
    await redis.quit();
  }
});

test("KNN returns the nearest stored records with cosine similarity and no hit decision", async () => {
  const suffix = crypto.randomUUID();
  const same = unitVector(0);
  const near = unitVector(0, 1);
  const far = unitVector(1);
  const ids = [`same-${suffix}`, `near-${suffix}`, `far-${suffix}`];

  try {
    await cache.upsert(entry(ids[0]!, "What is machine learning?", same, "answer-same"));
    await cache.upsert(entry(ids[1]!, "Can you explain machine learning?", near, "answer-near"));
    await cache.upsert(entry(ids[2]!, "How do I boil pasta?", far, "answer-far"));

    const candidates = await cache.search(same, 3);
    const ranked = candidates.filter((candidate) => ids.includes(candidate.id));

    assert.deepEqual(
      ranked.map((candidate) => candidate.id),
      ids,
    );
    assert.ok(ranked[0]!.score > 0.99);
    assert.ok(ranked[1]!.score > ranked[2]!.score);
    assert.equal(ranked[0]!.record.query, "What is machine learning?");
    assert.equal(ranked[0]!.record.response, "answer-same");
    assert.equal(ranked[0]!.record.model, "gemini:gemini-3.8-flash");
    assert.equal(ranked[0]!.record.language, "en");
    assert.deepEqual(ranked[0]!.record.metadata, { scope: "public" });
    assert.equal(ranked[0]!.record.embedding.length, EMBEDDING_DIMENSIONS);
    assert.equal("hit" in ranked[0]!, false);
  } finally {
    await Promise.all(ids.map((id) => cache.delete(id)));
  }
});

test("a stored record can be read back and removed from search", async () => {
  const id = `read-${crypto.randomUUID()}`;
  const embedding = unitVector(2);

  try {
    const stored = await cache.upsert(entry(id, "What is Redis?", embedding, "a database"));
    const loaded = await cache.get(id);
    assert.equal(loaded?.response, "a database");
    assert.equal(loaded?.id, stored.id);

    await cache.delete(id);
    assert.equal(await cache.get(id), undefined);
    const candidates = await cache.search(embedding, 5);
    assert.equal(candidates.some((candidate) => candidate.id === id), false);
  } finally {
    await cache.delete(id);
  }
});

test("an embedding with the wrong dimension is rejected", async () => {
  await assert.rejects(
    () => cache.upsert(entry(`bad-${crypto.randomUUID()}`, "bad", [1, 2, 3], "no")),
    VectorCacheError,
  );
});

test("an expired vector record is not returned", async () => {
  const id = `expired-${crypto.randomUUID()}`;
  const embedding = unitVector(3);

  try {
    await cache.upsert({ ...entry(id, "temporary", embedding, "gone"), ttlSeconds: 1 });
    await new Promise((resolve) => setTimeout(resolve, 1_200));
    const candidates = await cache.search(embedding, 5);
    assert.equal(candidates.some((candidate) => candidate.id === id), false);
  } finally {
    await cache.delete(id);
  }
});

function entry(id: string, query: string, embedding: number[], response: string) {
  return {
    id,
    query,
    embedding,
    response,
    model: "gemini:gemini-3.8-flash",
    language: "en",
    ttlSeconds: 60,
    metadata: { scope: "public" },
  };
}

function unitVector(primary: number, secondary?: number): number[] {
  const vector = Array.from({ length: EMBEDDING_DIMENSIONS }, () => 0);
  vector[primary] = 1;
  if (secondary !== undefined) {
    vector[secondary] = 1;
  }
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  return vector.map((value) => value / magnitude);
}
