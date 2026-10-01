import Fastify from "fastify";
import { PROJECT_NAME } from "@semantic-llm/shared";

const port = Number(process.env.PORT ?? 3001);
const host = process.env.HOST ?? "127.0.0.1";

if (!Number.isInteger(port) || port <= 0) {
  throw new Error("PORT must be a positive integer");
}

const app = Fastify({ logger: true });

app.get("/health", async () => {
  return {
    status: "ok",
    service: PROJECT_NAME,
  };
});

try {
  await app.listen({ port, host });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
