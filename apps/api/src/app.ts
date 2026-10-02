import { resolve } from "node:path";
import Fastify, { type FastifyInstance } from "fastify";
import { type ExactCache, pingRedis, type CacheRedisClient } from "@semantic-llm/cache";
import type { EmbeddingService } from "@semantic-llm/embeddings";
import type { LLMProvider } from "@semantic-llm/llm";
import { PROJECT_NAME } from "@semantic-llm/shared";
import { BenchmarkReportError, BenchmarkReportMissingError, loadBenchmarkReport } from "./benchmark-report";
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
  benchmarkReportPath?: string;
  logger?: boolean;
  closeRedis?: boolean;
};

const WEB_ORIGINS = new Set(["http://127.0.0.1:3000", "http://localhost:3000"]);

export function buildApp(dependencies: AppDependencies): FastifyInstance {
  const app = Fastify({ logger: dependencies.logger ?? true });
  app.addHook("onRequest", async (request, reply) => {
    const origin = request.headers.origin;
    const extra = process.env.WEB_ORIGIN?.trim();
    if (typeof origin === "string" && (WEB_ORIGINS.has(origin) || origin === extra)) {
      reply.header("Access-Control-Allow-Origin", origin);
      reply.header("Vary", "Origin");
      reply.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      reply.header("Access-Control-Allow-Headers", "Content-Type");
    }
    if (request.method === "OPTIONS") {
      return reply.code(204).send();
    }
  });
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

  const benchmarkReportPath =
    dependencies.benchmarkReportPath ??
    resolve(import.meta.dirname, "../../../datasets/evaluation-results.json");
  app.get("/api/benchmark", async (request, reply) => {
    try {
      return await loadBenchmarkReport(benchmarkReportPath);
    } catch (error) {
      if (error instanceof BenchmarkReportMissingError) {
        return reply.code(404).send({ error: error.message });
      }
      const message = error instanceof BenchmarkReportError ? error.message : "The benchmark report could not be read.";
      request.log.error({ message }, "Benchmark report read failed");
      return reply.code(500).send({ error: message });
    }
  });

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
