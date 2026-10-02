import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { ExactCache, exactCacheKey } from "./exact";
import { createRedisClient, type CacheRedisClient } from "./redis";

let redis: CacheRedisClient;

before(async () => {
  redis = createRedisClient(process.env.REDIS_URL ?? "redis://127.0.0.1:6379");
  redis.on("error", () => {});
  await redis.connect();
});

after(async () => {
  if (redis?.isOpen) {
    await redis.quit();
  }
});

test("an exact entry is reused for the same normalized question and model", async () => {
  const cache = new ExactCache(redis, 60);
  const model = `exact-${crypto.randomUUID()}`;
  const key = exactCacheKey("Hello?", model);

  try {
    assert.equal(await cache.get("Hello?", model), undefined);
    await cache.set("Hello?", model, "hello");
    const hit = await cache.get("  hello  ", model);

    assert.deepEqual(hit, { query: "Hello?", answer: "hello" });
    assert.equal(await cache.get("hello world", model), undefined);
    assert.equal(await cache.get("Hello?", `${model}-other`), undefined);
  } finally {
    await redis.del(key);
  }
});

test("corrupt JSON and an empty answer are misses", async () => {
  const cache = new ExactCache(redis, 60);
  const model = `exact-corrupt-${crypto.randomUUID()}`;
  const query = `corrupt ${crypto.randomUUID()}`;
  const key = exactCacheKey(query, model);

  try {
    await redis.set(key, "not-json", { EX: 60 });
    assert.equal(await cache.get(query, model), undefined);
    await redis.set(key, JSON.stringify({ query, answer: "" }), { EX: 60 });
    assert.equal(await cache.get(query, model), undefined);
  } finally {
    await redis.del(key);
  }
});

test("an expired exact entry is a miss", async () => {
  const cache = new ExactCache(redis, 1);
  const model = `exact-ttl-${crypto.randomUUID()}`;
  const query = `ttl ${crypto.randomUUID()}`;
  const key = exactCacheKey(query, model);

  try {
    await cache.set(query, model, "soon");
    assert.equal((await cache.get(query, model))?.answer, "soon");
    await delay(1_200);
    assert.equal(await cache.get(query, model), undefined);
  } finally {
    await redis.del(key);
  }
});

test("a Redis client that is not ready does not read or write", async () => {
  let calls = 0;
  const closed = {
    isReady: false,
    async get() {
      calls += 1;
      return null;
    },
    async set() {
      calls += 1;
      return null;
    },
  } as unknown as CacheRedisClient;
  const cache = new ExactCache(closed, 60);

  assert.equal(await cache.get("Hello", "model"), undefined);
  await cache.set("Hello", "model", "answer");
  assert.equal(calls, 0);
});

test("the exact cache rejects a non-positive TTL", () => {
  assert.throws(() => new ExactCache(redis, 0), /positive integer/);
});

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
