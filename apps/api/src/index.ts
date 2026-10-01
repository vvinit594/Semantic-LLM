import "./load-env";
import Fastify from "fastify";
import { createRedisClient, pingRedis } from "@semantic-llm/cache";
import { DEFAULT_GEMINI_MODEL, GeminiProvider } from "@semantic-llm/llm";
import { PROJECT_NAME } from "@semantic-llm/shared";
import { registerChatRoute } from "./chat";

const port = Number(process.env.PORT ?? 3001);
const host = process.env.HOST ?? "127.0.0.1";
const redisUrl = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";

if (!Number.isInteger(port) || port <= 0) {
  throw new Error("PORT must be a positive integer");
}

const app = Fastify({ logger: true });
const redis = createRedisClient(redisUrl);

redis.on("error", (error: unknown) => {
  app.log.error({ err: error }, "Redis client error");
});

async function redisStatus(): Promise<"ok" | "error"> {
  try {
    return (await pingRedis(redis)) ? "ok" : "error";
  } catch {
    return "error";
  }
}

const llm = new GeminiProvider(
  process.env.GEMINI_API_KEY ?? "",
  process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL,
);
registerChatRoute(app, llm);

app.get("/health", async () => {
  const redisState = await redisStatus();
  return {
    status: redisState === "ok" ? "ok" : "degraded",
    service: PROJECT_NAME,
    redis: redisState,
  };
});

app.addHook("onClose", async () => {
  if (redis.isOpen) {
    await redis.quit();
  }
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
