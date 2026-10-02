import type { FastifyInstance } from "fastify";
import { ExactCache, VectorCache, type CacheRedisClient } from "@semantic-llm/cache";
import type { EmbeddingService } from "@semantic-llm/embeddings";
import type { LLMProvider } from "@semantic-llm/llm";
import { buildApp } from "../app";

export class StubLlm implements LLMProvider {
  readonly name = "stub";
  calls = 0;

  async complete(prompt: string): Promise<string> {
    this.calls += 1;
    return `Load-test answer for ${prompt}`;
  }
}

export async function startStubServer(options: {
  redis: CacheRedisClient;
  embeddings: EmbeddingService;
  model: string;
}): Promise<{ app: FastifyInstance; url: string; llm: StubLlm }> {
  const llm = new StubLlm();
  const app = buildApp({
    llm,
    cache: new ExactCache(options.redis, 3_600),
    vectors: new VectorCache(options.redis),
    embeddings: options.embeddings,
    redis: options.redis,
    model: options.model,
    ttlSeconds: 3_600,
    logger: false,
    closeRedis: false,
  });
  await options.embeddings.init();
  await app.listen({ host: "127.0.0.1", port: 0 });
  const address = app.server.address();
  if (address === null || typeof address === "string") {
    await app.close();
    throw new Error("The load-test server did not bind a local port");
  }
  return { app, url: `http://127.0.0.1:${address.port}`, llm };
}
