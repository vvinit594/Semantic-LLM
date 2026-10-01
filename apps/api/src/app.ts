import Fastify, { type FastifyInstance } from "fastify";
import { type ExactCache, pingRedis, type CacheRedisClient } from "@semantic-llm/cache";
import type { LLMProvider } from "@semantic-llm/llm";
import { PROJECT_NAME } from "@semantic-llm/shared";
import { registerChatRoute } from "./chat";

export type AppDependencies = {
  llm: LLMProvider;
  cache: ExactCache;
  redis: CacheRedisClient;
  model: string;
  logger?: boolean;
  closeRedis?: boolean;
};

export function buildApp(dependencies: AppDependencies): FastifyInstance {
  const app = Fastify({ logger: dependencies.logger ?? true });
  registerChatRoute(app, dependencies);

  app.get("/health", async () => {
    let redisState: "ok" | "error" = "error";
    try {
      if (await pingRedis(dependencies.redis)) {
        redisState = "ok";
      }
    } catch {
      redisState = "error";
    }
    return {
      status: redisState === "ok" ? "ok" : "degraded",
      service: PROJECT_NAME,
      redis: redisState,
    };
  });

  app.addHook("onClose", async () => {
    if (dependencies.closeRedis !== false && dependencies.redis.isOpen) {
      await dependencies.redis.quit();
    }
  });

  return app;
}
