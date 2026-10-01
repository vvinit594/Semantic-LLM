import "./load-env";
import {
  DEFAULT_EXACT_CACHE_TTL_SECONDS,
  ExactCache,
  createRedisClient,
  pingRedis,
} from "@semantic-llm/cache";
import { DEFAULT_GEMINI_MODEL, GeminiProvider } from "@semantic-llm/llm";
import { buildApp } from "./app";
import { RequestMetrics } from "./metrics";

const port = Number(process.env.PORT ?? 3001);
const host = process.env.HOST ?? "127.0.0.1";
const redisUrl = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";
const model = process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL;
const ttlSeconds = readTtlSeconds(process.env.CACHE_TTL_SECONDS);

if (!Number.isInteger(port) || port <= 0) {
  throw new Error("PORT must be a positive integer");
}

const redis = createRedisClient(redisUrl);
const app = buildApp({
  llm: new GeminiProvider(process.env.GEMINI_API_KEY ?? "", model),
  cache: new ExactCache(redis, ttlSeconds),
  redis,
  model,
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
