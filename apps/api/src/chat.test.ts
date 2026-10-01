import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { ExactCache, createRedisClient, exactCacheKey, type CacheRedisClient } from "@semantic-llm/cache";
import type { LLMProvider } from "@semantic-llm/llm";
import "./load-env";
import { buildApp } from "./app";

class FakeLlm implements LLMProvider {
  readonly name = "fake";
  readonly calls: string[] = [];

  async complete(prompt: string): Promise<string> {
    this.calls.push(prompt);
    return `stored:${prompt}`;
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

test("an identical question misses, stores, then hits without another LLM call", async () => {
  const llm = new FakeLlm();
  const model = `test-${crypto.randomUUID()}`;
  const app = buildApp({
    llm,
    cache: new ExactCache(redis, 60),
    redis,
    model,
    logger: false,
    closeRedis: false,
  });

  try {
    const first = await app.inject({
      method: "POST",
      url: "/api/chat",
      payload: { message: "What is machine learning?" },
    });
    const second = await app.inject({
      method: "POST",
      url: "/api/chat",
      payload: { message: "What is machine learning?" },
    });

    assert.equal(first.statusCode, 200);
    assert.deepEqual(first.json(), {
      answer: "stored:What is machine learning?",
      cached: false,
    });
    assert.deepEqual(second.json(), {
      answer: "stored:What is machine learning?",
      cached: true,
    });
    assert.deepEqual(llm.calls, ["What is machine learning?"]);
  } finally {
    await redis.del(exactCacheKey("What is machine learning?", `fake:${model}`));
    await app.close();
  }
});

test("a different question is another miss", async () => {
  const llm = new FakeLlm();
  const model = `test-${crypto.randomUUID()}`;
  const app = buildApp({
    llm,
    cache: new ExactCache(redis, 60),
    redis,
    model,
    logger: false,
    closeRedis: false,
  });
  const firstMessage = `alpha ${model}`;
  const secondMessage = `beta ${model}`;

  try {
    await app.inject({ method: "POST", url: "/api/chat", payload: { message: firstMessage } });
    const different = await app.inject({
      method: "POST",
      url: "/api/chat",
      payload: { message: secondMessage },
    });

    assert.equal(different.statusCode, 200);
    assert.equal(different.json().cached, false);
    assert.deepEqual(llm.calls, [firstMessage, secondMessage]);
  } finally {
    await redis.del(exactCacheKey(firstMessage, `fake:${model}`));
    await redis.del(exactCacheKey(secondMessage, `fake:${model}`));
    await app.close();
  }
});

test("the same trimmed question hits the stored answer", async () => {
  const llm = new FakeLlm();
  const model = `test-${crypto.randomUUID()}`;
  const app = buildApp({
    llm,
    cache: new ExactCache(redis, 60),
    redis,
    model,
    logger: false,
    closeRedis: false,
  });

  try {
    await app.inject({
      method: "POST",
      url: "/api/chat",
      payload: { message: "What is machine learning?" },
    });
    const padded = await app.inject({
      method: "POST",
      url: "/api/chat",
      payload: { message: "  What is machine learning?  " },
    });

    assert.equal(padded.json().cached, true);
    assert.equal(padded.json().answer, "stored:What is machine learning?");
    assert.deepEqual(llm.calls, ["What is machine learning?"]);
  } finally {
    await redis.del(exactCacheKey("What is machine learning?", `fake:${model}`));
    await app.close();
  }
});

test("an expired exact entry misses and calls the LLM again", async () => {
  const llm = new FakeLlm();
  const model = `test-${crypto.randomUUID()}`;
  const message = `expire ${model}`;
  const app = buildApp({
    llm,
    cache: new ExactCache(redis, 1),
    redis,
    model,
    logger: false,
    closeRedis: false,
  });

  try {
    const first = await app.inject({ method: "POST", url: "/api/chat", payload: { message } });
    await new Promise((resolve) => setTimeout(resolve, 1_100));
    const second = await app.inject({ method: "POST", url: "/api/chat", payload: { message } });

    assert.equal(first.json().cached, false);
    assert.equal(second.json().cached, false);
    assert.deepEqual(llm.calls, [message, message]);
  } finally {
    await redis.del(exactCacheKey(message, `fake:${model}`));
    await app.close();
  }
});
