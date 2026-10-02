import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import {
  ExactCache,
  VectorCache,
  createRedisClient,
  exactCacheKey,
  type CacheRedisClient,
} from "@semantic-llm/cache";
import type { EmbeddingService } from "@semantic-llm/embeddings";
import type { LLMProvider } from "@semantic-llm/llm";
import { EMBEDDING_DIMENSIONS } from "@semantic-llm/shared";
import "./load-env";
import { buildApp } from "./app";
import { embeddingText } from "@semantic-llm/query";
import { DEFAULT_SIMILARITY_THRESHOLD } from "./semantic-cache";
import {
  HashEmbeddings,
  blendEmbeddings,
  dot,
  unitEmbedding,
} from "./test-vectors";

class FakeLlm implements LLMProvider {
  readonly name = "fake";
  readonly calls: string[] = [];

  async complete(prompt: string): Promise<string> {
    this.calls.push(prompt);
    return `stored:${prompt}`;
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

class FailingEmbeddings implements EmbeddingService {
  readonly model = "fake";
  readonly dimensions = EMBEDDING_DIMENSIONS;

  async init(): Promise<void> {}

  async embed(): Promise<number[]> {
    throw new Error("embed failed");
  }
}

const france = "What is the capital of France?";
const franceParaphrase = "Which city is the capital of France?";
const pasta = "How do I boil pasta?";

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
    logger: false,
    closeRedis: false,
  });
  const message = "What is machine learning?";

  try {
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

    assert.equal(first.statusCode, 200);
    assert.deepEqual(first.json(), {
      answer: "stored:What is machine learning?",
      cached: false,
    });
    assert.deepEqual(second.json(), {
      answer: "stored:What is machine learning?",
      cached: true,
    });
    assert.deepEqual(llm.calls, [message]);
  } finally {
    await removeStored(vectors, embeddings, model, [message]);
    await app.close();
  }
});

test("a different question is another miss", async () => {
  const llm = new FakeLlm();
  const model = `test-${crypto.randomUUID()}`;
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
    logger: false,
    closeRedis: false,
  });
  const firstMessage = `alpha ${model}`;
  const secondMessage = `beta ${model}`;

  try {
    const similarity = dot(
      await embeddings.embed(embeddingText(firstMessage)),
      await embeddings.embed(embeddingText(secondMessage)),
    );
    assert.ok(similarity < DEFAULT_SIMILARITY_THRESHOLD);

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
    await removeStored(vectors, embeddings, model, [firstMessage, secondMessage]);
    await app.close();
  }
});

test("a case and punctuation variant hits the same exact answer", async () => {
  const llm = new FakeLlm();
  const model = `case-${crypto.randomUUID()}`;
  const embeddings = new HashEmbeddings();
  const vectors = new VectorCache(redis);
  const message = `What is cache ${model}?`;
  const variant = `  WHAT   is cache ${model}???  `;
  const app = buildApp({
    llm,
    cache: new ExactCache(redis, 60),
    vectors,
    embeddings,
    redis,
    model,
    ttlSeconds: 60,
    logger: false,
    closeRedis: false,
  });

  try {
    await app.inject({ method: "POST", url: "/api/chat", payload: { message } });
    const second = await app.inject({ method: "POST", url: "/api/chat", payload: { message: variant } });

    assert.equal(second.json().cached, true);
    assert.equal(second.json().answer, `stored:${message}`);
    assert.deepEqual(llm.calls, [message]);
  } finally {
    await removeStored(vectors, embeddings, model, [message, variant.trim()]);
    await app.close();
  }
});

test("the same trimmed question hits the stored answer", async () => {
  const llm = new FakeLlm();
  const model = `test-${crypto.randomUUID()}`;
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
    logger: false,
    closeRedis: false,
  });
  const message = "What is machine learning?";

  try {
    await app.inject({
      method: "POST",
      url: "/api/chat",
      payload: { message },
    });
    const padded = await app.inject({
      method: "POST",
      url: "/api/chat",
      payload: { message: "  What is machine learning?  " },
    });

    assert.equal(padded.json().cached, true);
    assert.equal(padded.json().answer, "stored:What is machine learning?");
    assert.deepEqual(llm.calls, [message]);
  } finally {
    await removeStored(vectors, embeddings, model, [message]);
    await app.close();
  }
});

test("an expired exact entry misses and calls the LLM again", async () => {
  const llm = new FakeLlm();
  const model = `test-${crypto.randomUUID()}`;
  const message = `expire ${model}`;
  const embeddings = new HashEmbeddings();
  const vectors = new VectorCache(redis);
  const app = buildApp({
    llm,
    cache: new ExactCache(redis, 1),
    vectors,
    embeddings,
    redis,
    model,
    ttlSeconds: 1,
    logger: false,
    closeRedis: false,
  });

  try {
    const first = await app.inject({ method: "POST", url: "/api/chat", payload: { message } });
    await new Promise((resolve) => setTimeout(resolve, 1_200));
    const second = await app.inject({ method: "POST", url: "/api/chat", payload: { message } });

    assert.equal(first.json().cached, false);
    assert.equal(second.json().cached, false);
    assert.deepEqual(llm.calls, [message, message]);
  } finally {
    await removeStored(vectors, embeddings, model, [message]);
    await app.close();
  }
});

test("a paraphrase above the threshold hits without another LLM call", async () => {
  const llm = new FakeLlm();
  const model = `paraphrase-${crypto.randomUUID()}`;
  const original = unitEmbedding(17);
  const paraphrase = blendEmbeddings(original, unitEmbedding(18), 0.08);
  const embeddings = new MappedEmbeddings(
    new Map([
      [france, original],
      [franceParaphrase, paraphrase],
    ]),
  );
  const vectors = new VectorCache(redis);
  const app = buildApp({
    llm,
    cache: new ExactCache(redis, 60),
    vectors,
    embeddings,
    redis,
    model,
    ttlSeconds: 60,
    logger: false,
    closeRedis: false,
  });

  try {
    await removeStored(vectors, embeddings, model, [france, franceParaphrase]);
    assert.ok(dot(original, paraphrase) >= DEFAULT_SIMILARITY_THRESHOLD);
    const first = await app.inject({ method: "POST", url: "/api/chat", payload: { message: france } });
    const second = await app.inject({
      method: "POST",
      url: "/api/chat",
      payload: { message: franceParaphrase },
    });

    assert.equal(first.json().cached, false);
    assert.deepEqual(second.json(), {
      answer: "stored:What is the capital of France?",
      cached: true,
    });
    assert.deepEqual(llm.calls, [france]);
  } finally {
    await removeStored(vectors, embeddings, model, [france, franceParaphrase]);
    await app.close();
  }
});

test("an unrelated question below the threshold misses", async () => {
  const llm = new FakeLlm();
  const model = `unrelated-${crypto.randomUUID()}`;
  const original = unitEmbedding(40);
  const unrelated = unitEmbedding(90);
  const embeddings = new MappedEmbeddings(
    new Map([
      [france, original],
      [pasta, unrelated],
    ]),
  );
  const vectors = new VectorCache(redis);
  const app = buildApp({
    llm,
    cache: new ExactCache(redis, 60),
    vectors,
    embeddings,
    redis,
    model,
    ttlSeconds: 60,
    logger: false,
    closeRedis: false,
  });

  try {
    await removeStored(vectors, embeddings, model, [france, pasta]);
    assert.ok(dot(original, unrelated) < DEFAULT_SIMILARITY_THRESHOLD);
    await app.inject({ method: "POST", url: "/api/chat", payload: { message: france } });
    const different = await app.inject({
      method: "POST",
      url: "/api/chat",
      payload: { message: pasta },
    });

    assert.equal(different.json().cached, false);
    assert.equal(different.json().answer, "stored:How do I boil pasta?");
    assert.deepEqual(llm.calls, [france, pasta]);
  } finally {
    await removeStored(vectors, embeddings, model, [france, pasta]);
    await app.close();
  }
});

test("a similar entry from a different model misses", async () => {
  const llm = new FakeLlm();
  const embeddings = new HashEmbeddings();
  const vectors = new VectorCache(redis);
  const message = `model boundary ${crypto.randomUUID()}`;
  const modelA = `model-a-${crypto.randomUUID()}`;
  const modelB = `model-b-${crypto.randomUUID()}`;
  const appA = buildApp({
    llm,
    cache: new ExactCache(redis, 60),
    vectors,
    embeddings,
    redis,
    model: modelA,
    ttlSeconds: 60,
    logger: false,
    closeRedis: false,
  });
  const appB = buildApp({
    llm,
    cache: new ExactCache(redis, 60),
    vectors,
    embeddings,
    redis,
    model: modelB,
    ttlSeconds: 60,
    logger: false,
    closeRedis: false,
  });

  try {
    const first = await appA.inject({ method: "POST", url: "/api/chat", payload: { message } });
    const second = await appB.inject({ method: "POST", url: "/api/chat", payload: { message } });

    assert.equal(first.json().cached, false);
    assert.equal(second.json().cached, false);
    assert.deepEqual(llm.calls, [message, message]);
  } finally {
    await removeStored(vectors, embeddings, modelA, [message]);
    await removeStored(vectors, embeddings, modelB, [message]);
    await appA.close();
    await appB.close();
  }
});

test("India and China do not reuse a cached answer", async () => {
  const llm = new FakeLlm();
  const model = `india-${crypto.randomUUID()}`;
  const india = "What is the capital of India?";
  const china = "What is the capital of China?";
  const indiaVector = unitEmbedding(120);
  const chinaVector = blendEmbeddings(indiaVector, unitEmbedding(121), 0.08);
  const embeddings = new MappedEmbeddings(
    new Map([
      [india, indiaVector],
      [china, chinaVector],
    ]),
  );
  const vectors = new VectorCache(redis);
  const app = buildApp({
    llm,
    cache: new ExactCache(redis, 60),
    vectors,
    embeddings,
    redis,
    model,
    ttlSeconds: 60,
    logger: false,
    closeRedis: false,
  });

  try {
    await removeStored(vectors, embeddings, model, [india, china]);
    assert.ok(dot(indiaVector, chinaVector) >= DEFAULT_SIMILARITY_THRESHOLD);
    await app.inject({ method: "POST", url: "/api/chat", payload: { message: india } });
    const second = await app.inject({ method: "POST", url: "/api/chat", payload: { message: china } });

    assert.equal(second.json().cached, false);
    assert.equal(second.json().answer, `stored:${china}`);
    assert.deepEqual(llm.calls, [india, china]);
  } finally {
    await removeStored(vectors, embeddings, model, [india, china]);
    await app.close();
  }
});

test("2+2 and 2+3 do not reuse a cached answer", async () => {
  const llm = new FakeLlm();
  const model = `sum-${crypto.randomUUID()}`;
  const twoTwo = "What is 2+2?";
  const twoThree = "What is 2+3?";
  const twoTwoVector = unitEmbedding(130);
  const twoThreeVector = blendEmbeddings(twoTwoVector, unitEmbedding(131), 0.08);
  const embeddings = new MappedEmbeddings(
    new Map([
      [twoTwo, twoTwoVector],
      [twoThree, twoThreeVector],
    ]),
  );
  const vectors = new VectorCache(redis);
  const app = buildApp({
    llm,
    cache: new ExactCache(redis, 60),
    vectors,
    embeddings,
    redis,
    model,
    ttlSeconds: 60,
    logger: false,
    closeRedis: false,
  });

  try {
    await removeStored(vectors, embeddings, model, [twoTwo, twoThree]);
    assert.ok(dot(twoTwoVector, twoThreeVector) >= DEFAULT_SIMILARITY_THRESHOLD);
    await app.inject({ method: "POST", url: "/api/chat", payload: { message: twoTwo } });
    const second = await app.inject({ method: "POST", url: "/api/chat", payload: { message: twoThree } });

    assert.equal(second.json().cached, false);
    assert.equal(second.json().answer, `stored:${twoThree}`);
    assert.deepEqual(llm.calls, [twoTwo, twoThree]);
  } finally {
    await removeStored(vectors, embeddings, model, [twoTwo, twoThree]);
    await app.close();
  }
});

test("a latest question does not hit the cache on a repeat", async () => {
  const llm = new FakeLlm();
  const model = `latest-${crypto.randomUUID()}`;
  const message = "What is the latest news?";
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
    logger: false,
    closeRedis: false,
  });

  try {
    const first = await app.inject({ method: "POST", url: "/api/chat", payload: { message } });
    const second = await app.inject({ method: "POST", url: "/api/chat", payload: { message } });

    assert.equal(first.json().cached, false);
    assert.equal(second.json().cached, false);
    assert.deepEqual(llm.calls, [message, message]);
  } finally {
    await redis.del(exactCacheKey(message, `fake:${model}`));
    await app.close();
  }
});

test("a vector search failure still returns the LLM answer", async () => {
  const llm = new FakeLlm();
  const model = `search-fail-${crypto.randomUUID()}`;
  const message = `search failure ${model}`;
  const app = buildApp({
    llm,
    cache: new ExactCache(redis, 60),
    vectors: {
      async search() {
        throw new Error("redis down");
      },
      async upsert() {
        throw new Error("redis down");
      },
    },
    embeddings: new HashEmbeddings(),
    redis,
    model,
    ttlSeconds: 60,
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
    assert.deepEqual(response.json(), { answer: `stored:${message}`, cached: false });
    assert.deepEqual(llm.calls, [message]);
  } finally {
    await redis.del(exactCacheKey(message, `fake:${model}`));
    await app.close();
  }
});

test("an embedding failure still returns the LLM answer", async () => {
  const llm = new FakeLlm();
  const model = `embed-fail-${crypto.randomUUID()}`;
  const message = `embed failure ${model}`;
  const app = buildApp({
    llm,
    cache: new ExactCache(redis, 60),
    vectors: new VectorCache(redis),
    embeddings: new FailingEmbeddings(),
    redis,
    model,
    ttlSeconds: 60,
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
    assert.deepEqual(response.json(), { answer: `stored:${message}`, cached: false });
    assert.deepEqual(llm.calls, [message]);
  } finally {
    await redis.del(exactCacheKey(message, `fake:${model}`));
    await app.close();
  }
});

async function removeStored(
  vectors: VectorCache,
  embeddings: EmbeddingService,
  model: string,
  queries: string[],
): Promise<void> {
  for (const query of queries) {
    await redis.del(exactCacheKey(query, `fake:${model}`));
    const candidates = await vectors.search(await embeddings.embed(embeddingText(query)), 8);
    for (const candidate of candidates) {
      if (queries.includes(candidate.record.query)) {
        await vectors.delete(candidate.id);
      }
    }
  }
}
