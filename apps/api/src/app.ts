import Fastify, { type FastifyInstance } from "fastify";
import { type ExactCache, pingRedis, type CacheRedisClient } from "@semantic-llm/cache";
import type { EmbeddingService } from "@semantic-llm/embeddings";
import type { LLMProvider } from "@semantic-llm/llm";
import { PROJECT_NAME } from "@semantic-llm/shared";
import { registerChatRoute } from "./chat";
import { RequestMetrics, type MetricsRecorder } from "./metrics";
import {
  DEFAULT_SEMANTIC_TOP_K,
  DEFAULT_SIMILARITY_THRESHOLD,
  type SemanticVectorStore,
} from "./semantic-cache";

export type AppDependencies = {
  llm: LLMProvider;
  cache: ExactCache;
  vectors: SemanticVectorStore;
  embeddings: EmbeddingService;
  redis: CacheRedisClient;
  model: string;
  ttlSeconds: number;
  similarityThreshold?: number;
  topK?: number;
  metrics?: MetricsRecorder;
  logger?: boolean;
  closeRedis?: boolean;
};

export function buildApp(dependencies: AppDependencies): FastifyInstance {
  const app = Fastify({ logger: dependencies.logger ?? true });
  const metrics = dependencies.metrics ?? new RequestMetrics();
  registerChatRoute(app, {
    llm: dependencies.llm,
    cache: dependencies.cache,
    vectors: dependencies.vectors,
    embeddings: dependencies.embeddings,
    model: dependencies.model,
    ttlSeconds: dependencies.ttlSeconds,
    similarityThreshold: dependencies.similarityThreshold ?? DEFAULT_SIMILARITY_THRESHOLD,
    topK: dependencies.topK ?? DEFAULT_SEMANTIC_TOP_K,
    metrics,
  });

  app.get("/api/metrics", async () => metrics.snapshot());

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
