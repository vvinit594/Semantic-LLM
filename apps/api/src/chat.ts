import type { FastifyInstance } from "fastify";
import { MissingGeminiApiKeyError, type LLMProvider } from "@semantic-llm/llm";

const MAX_MESSAGE_LENGTH = 8_000;

export function registerChatRoute(app: FastifyInstance, llm: LLMProvider): void {
  app.post("/api/chat", async (request, reply) => {
    const message = readMessage(request.body);
    if (!message) {
      return reply.code(400).send({
        error: "message must be a non-empty string up to 8000 characters",
      });
    }

    try {
      const answer = await llm.complete(message);
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
  const message = error instanceof Error ? error.message : "LLM request failed";
  if (!secret) {
    return message;
  }
  return message.replaceAll(secret, "[redacted]");
}
