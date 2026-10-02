import type { FastifyInstance } from "fastify";
import type { ExactCache } from "@semantic-llm/cache";
import type { EmbeddingService } from "@semantic-llm/embeddings";
import { MissingGeminiApiKeyError, type LLMProvider } from "@semantic-llm/llm";
import type { LatencySample, MetricsRecorder } from "./metrics";
import {
  findSimilarAnswer,
  type SemanticVectorStore,
} from "./semantic-cache";

const MAX_MESSAGE_LENGTH = 8_000;
const CACHE_LANGUAGE = "und";
const CACHE_SCOPE = "public";

export type ChatDependencies = {
  llm: LLMProvider;
  cache: ExactCache;
  vectors: SemanticVectorStore;
  embeddings: EmbeddingService;
  model: string;
  ttlSeconds: number;
  similarityThreshold: number;
  topK: number;
  metrics: MetricsRecorder;
};

export function registerChatRoute(app: FastifyInstance, dependencies: ChatDependencies): void {
  const { llm, cache, vectors, embeddings, model, metrics, ttlSeconds, similarityThreshold, topK } =
    dependencies;
  assertThreshold(similarityThreshold);
  assertTopK(topK);
  assertTtl(ttlSeconds);

  app.post("/api/chat", async (request, reply) => {
    const message = readMessage(request.body);
    if (!message) {
      return reply.code(400).send({
        error: "message must be a non-empty string up to 8000 characters",
      });
    }

    const started = performance.now();
    const cacheModel = `${llm.name}:${model}`;
    let cacheMs = 0;

    const readStarted = performance.now();
    let cachedAnswer: string | undefined;
    try {
      cachedAnswer = await cache.get(message, cacheModel);
    } catch (error) {
      request.log.error({ message: redactSecrets(error) }, "Exact cache read failed");
    } finally {
      cacheMs += elapsedMs(readStarted);
    }

    if (cachedAnswer) {
      recordMetric(metrics, request.log, {
        outcome: "hit",
        llmCalled: false,
        totalMs: elapsedMs(started),
        cacheMs,
        llmMs: 0,
      });
      request.log.info("Exact cache HIT");
      return { answer: cachedAnswer, cached: true };
    }

    request.log.info("Exact cache MISS");
    const semanticStarted = performance.now();
    const match = await findSimilarAnswer({
      query: message,
      embeddings,
      vectors,
      topK,
      threshold: similarityThreshold,
      model: cacheModel,
      language: CACHE_LANGUAGE,
      scope: CACHE_SCOPE,
    });
    cacheMs += elapsedMs(semanticStarted);

    if (match.decision === "hit") {
      recordMetric(metrics, request.log, {
        outcome: "hit",
        llmCalled: false,
        totalMs: elapsedMs(started),
        cacheMs,
        llmMs: 0,
      });
      request.log.info({ score: match.score }, "Semantic cache HIT");
      return { answer: match.answer, cached: true };
    }

    if (match.decision === "unavailable") {
      request.log.error({ message: redactSecrets(match.reason) }, "Semantic cache lookup failed");
    } else {
      request.log.info({ reason: match.reason }, "Semantic cache MISS");
    }

    const llmStarted = performance.now();
    try {
      const answer = await llm.complete(message);
      const llmMs = elapsedMs(llmStarted);
      const storeStarted = performance.now();
      try {
        await cache.set(message, cacheModel, answer);
      } catch (error) {
        request.log.error({ message: redactSecrets(error) }, "Exact cache store failed");
      }
      if (match.embedding) {
        try {
          await vectors.upsert({
            query: message,
            embedding: match.embedding,
            response: answer,
            model: cacheModel,
            language: CACHE_LANGUAGE,
            ttlSeconds,
            metadata: { scope: CACHE_SCOPE },
          });
        } catch (error) {
          request.log.error({ message: redactSecrets(error) }, "Semantic cache store failed");
        }
      }
      cacheMs += elapsedMs(storeStarted);
      recordMetric(metrics, request.log, {
        outcome: "miss",
        llmCalled: true,
        totalMs: elapsedMs(started),
        cacheMs,
        llmMs,
      });
      return { answer, cached: false };
    } catch (error) {
      const llmCalled = !(error instanceof MissingGeminiApiKeyError);
      recordMetric(metrics, request.log, {
        outcome: "miss",
        llmCalled,
        totalMs: elapsedMs(started),
        cacheMs,
        llmMs: llmCalled ? elapsedMs(llmStarted) : 0,
      });
      if (error instanceof MissingGeminiApiKeyError) {
        return reply.code(503).send({ error: "GEMINI_API_KEY is not set" });
      }
      request.log.error({ message: redactSecrets(error) }, "LLM request failed");
      return reply.code(502).send({ error: "LLM request failed" });
    }
  });
}

function assertThreshold(threshold: number): void {
  if (!Number.isFinite(threshold) || threshold <= 0 || threshold > 1) {
    throw new Error("similarity threshold must be greater than 0 and at most 1");
  }
}

function assertTopK(topK: number): void {
  if (!Number.isInteger(topK) || topK <= 0) {
    throw new Error("topK must be a positive integer");
  }
}

function assertTtl(ttlSeconds: number): void {
  if (!Number.isInteger(ttlSeconds) || ttlSeconds <= 0) {
    throw new Error("ttlSeconds must be a positive integer");
  }
}

function recordMetric(
  metrics: MetricsRecorder,
  log: { error: (object: { message: string }, message: string) => void },
  sample: LatencySample,
): void {
  try {
    metrics.record(sample);
  } catch (error) {
    log.error({ message: redactSecrets(error) }, "Metrics record failed");
  }
}

function elapsedMs(started: number): number {
  const value = performance.now() - started;
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function readMessage(body: unknown): string | undefined {
  if (typeof body !== "object" || body === null || !("message" in body)) {
    return undefined;
  }
  const message = body.message;
  if (typeof message !== "string") {
    return undefined;
  }
  const trimmed = message.trim();
  if (!trimmed || trimmed.length > MAX_MESSAGE_LENGTH) {
    return undefined;
  }
  return trimmed;
}

function redactSecrets(error: unknown): string {
  const secret = process.env.GEMINI_API_KEY?.trim() ?? "";
  const message = error instanceof Error ? error.message : "request failed";
  if (!secret) {
    return message;
  }
  return message.replaceAll(secret, "[redacted]");
}
