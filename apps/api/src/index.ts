import "./load-env";
import {
  DEFAULT_EXACT_CACHE_TTL_SECONDS,
  ExactCache,
  VectorCache,
  createRedisClient,
  pingRedis,
} from "@semantic-llm/cache";
import { createLocalEmbeddingService } from "@semantic-llm/embeddings";
import { DEFAULT_GEMINI_MODEL, GeminiProvider } from "@semantic-llm/llm";
import { buildApp } from "./app";
import { RequestMetrics } from "./metrics";
import { DEFAULT_SEMANTIC_TOP_K, DEFAULT_SIMILARITY_THRESHOLD } from "./semantic-cache";

const port = Number(process.env.PORT ?? 3001);
const host = process.env.HOST ?? "127.0.0.1";
const redisUrl = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";
const model = process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL;
const ttlSeconds = readTtlSeconds(process.env.CACHE_TTL_SECONDS);
const similarityThreshold = readThreshold(process.env.SEMANTIC_SIMILARITY_THRESHOLD);
const topK = readTopK(process.env.SEMANTIC_TOP_K);

if (!Number.isInteger(port) || port <= 0) {
  throw new Error("PORT must be a positive integer");
}

const redis = createRedisClient(redisUrl);
const embeddings = createLocalEmbeddingService();
const app = buildApp({
  llm: new GeminiProvider(process.env.GEMINI_API_KEY ?? "", model),
  cache: new ExactCache(redis, ttlSeconds),
  vectors: new VectorCache(redis),
  embeddings,
  redis,
  model,
  ttlSeconds,
  similarityThreshold,
  topK,
  metrics: new RequestMetrics(),
});

redis.on("error", (error: unknown) => {
  app.log.error({ err: error }, "Redis client error");
});

try {
  await redis.connect();
  const connected = await pingRedis(redis);
  if (connected) {
    app.log.info("Redis connection SUCCESS");
  } else {
    app.log.error("Redis connection FAILED");
  }
} catch (error) {
  app.log.error({ err: error }, "Redis connection FAILED");
}

void embeddings.init().then(
  () => {
    app.log.info("Embedding model ready");
  },
  (error: unknown) => {
    app.log.error({ err: error }, "Embedding model failed to load");
  },
);

try {
  await app.listen({ port, host });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}

function readTtlSeconds(value: string | undefined): number {
  if (value === undefined || value.trim() === "") {
    return DEFAULT_EXACT_CACHE_TTL_SECONDS;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error("CACHE_TTL_SECONDS must be a positive integer");
  }
  return parsed;
}

function readThreshold(value: string | undefined): number {
  if (value === undefined || value.trim() === "") {
    return DEFAULT_SIMILARITY_THRESHOLD;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 1) {
    throw new Error("SEMANTIC_SIMILARITY_THRESHOLD must be greater than 0 and at most 1");
  }
  return parsed;
}

function readTopK(value: string | undefined): number {
  if (value === undefined || value.trim() === "") {
    return DEFAULT_SEMANTIC_TOP_K;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error("SEMANTIC_TOP_K must be a positive integer");
  }
  return parsed;
}
