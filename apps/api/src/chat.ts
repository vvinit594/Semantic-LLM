import type { FastifyInstance } from "fastify";
import type { ExactCache } from "@semantic-llm/cache";
import { MissingGeminiApiKeyError, type LLMProvider } from "@semantic-llm/llm";

const MAX_MESSAGE_LENGTH = 8_000;

export type ChatDependencies = {
  llm: LLMProvider;
  cache: ExactCache;
  model: string;
};

export function registerChatRoute(app: FastifyInstance, dependencies: ChatDependencies): void {
  const { llm, cache, model } = dependencies;

  app.post("/api/chat", async (request, reply) => {
    const message = readMessage(request.body);
    if (!message) {
      return reply.code(400).send({
        error: "message must be a non-empty string up to 8000 characters",
      });
    }

    const cacheModel = `${llm.name}:${model}`;

    try {
      const cachedAnswer = await cache.get(message, cacheModel);
      if (cachedAnswer) {
        request.log.info("Exact cache HIT");
        return { answer: cachedAnswer, cached: true };
      }
    } catch (error) {
      request.log.error({ message: redactSecrets(error) }, "Exact cache read failed");
    }

    try {
      request.log.info("Exact cache MISS");
      const answer = await llm.complete(message);
      try {
        await cache.set(message, cacheModel, answer);
      } catch (error) {
        request.log.error({ message: redactSecrets(error) }, "Exact cache store failed");
      }
      return { answer, cached: false };
    } catch (error) {
      if (error instanceof MissingGeminiApiKeyError) {
        return reply.code(503).send({ error: "GEMINI_API_KEY is not set" });
      }
      request.log.error({ message: redactSecrets(error) }, "LLM request failed");
      return reply.code(502).send({ error: "LLM request failed" });
    }
  });
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
