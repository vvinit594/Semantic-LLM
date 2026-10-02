import { writeFile } from "node:fs/promises";
import { createRedisClient, type CacheRedisClient } from "@semantic-llm/cache";
import { createLocalEmbeddingService } from "@semantic-llm/embeddings";
import "../load-env";
import { startStubServer } from "./app";
import { deleteLoadEntries } from "./cleanup";
import { sendLoadRequest } from "./http";
import { helpText, LoadPlanError, parseLoadArgs, selectScenarios } from "./plan";
import { formatReport } from "./report";
import { runScenario } from "./run";
import type { ScenarioReport } from "./stats";

const config = parseArgs(process.argv.slice(2));
if (config) {
  try {
    const reports = await execute(config);
    if (config.outPath) {
      await writeFile(config.outPath, `${JSON.stringify(reports, null, 2)}\n`, "utf8");
      console.log(`Wrote ${config.outPath}`);
    }
  } catch (error) {
    console.error(publicError(error));
    process.exitCode = 1;
  }
}

function parseArgs(argv: string[]) {
  try {
    return parseLoadArgs(argv);
  } catch (error) {
    if (error instanceof LoadPlanError && error.message === "help") {
      console.log(helpText());
      return undefined;
    }
    console.error(publicError(error));
    process.exitCode = 1;
    return undefined;
  }
}

async function execute(config: NonNullable<ReturnType<typeof parseArgs>>): Promise<ScenarioReport[]> {
  const { run, skipped } = selectScenarios(config);
  const runId = crypto.randomUUID();
  const messages = new Set<string>();
  console.log(config.mode === "safe"
    ? "Safe mode: stub LLM, local embeddings, and Redis. Gemini is not called."
    : `Live mode: ${config.url}. Gemini is called only for cache misses.`);
  for (const item of skipped) {
    console.log(`Skipped ${item.scenario}: ${item.reason}`);
  }

  if (config.mode === "safe") {
    return runSafe(config, run, runId, messages);
  }
  const reports: ScenarioReport[] = [];
  for (const scenario of run) {
    console.log(`\nRunning ${scenario}...`);
    const report = await runScenario({
      scenario,
      mode: "live",
      concurrency: config.concurrency,
      requests: config.requests,
      durationMs: config.durationMs,
      runId,
      workingSet: config.workingSet,
      maxLlmCalls: config.maxLlmCalls,
      send: (request) => sendLoadRequest(config.url, request),
      messages,
    });
    console.log(formatReport(report));
    reports.push(report);
  }
  return reports;
}

async function runSafe(
  config: NonNullable<ReturnType<typeof parseArgs>>,
  scenarios: ReturnType<typeof selectScenarios>["run"],
  runId: string,
  messages: Set<string>,
): Promise<ScenarioReport[]> {
  const redis = createRedisClient(process.env.REDIS_URL ?? "redis://127.0.0.1:6379");
  redis.on("error", () => {});
  const model = `load-${runId}`;
  const cacheModel = `stub:${model}`;
  let server: Awaited<ReturnType<typeof startStubServer>> | undefined;
  const reports: ScenarioReport[] = [];
  try {
    await redis.connect();
    const started = await startStubServer({
      redis,
      embeddings: createLocalEmbeddingService(),
      model,
    });
    server = started;
    for (const scenario of scenarios) {
      console.log(`\nRunning ${scenario}...`);
      const report = await runScenario({
        scenario,
        mode: "safe",
        concurrency: config.concurrency,
        requests: config.requests,
        durationMs: config.durationMs,
        runId,
        workingSet: config.workingSet,
        maxLlmCalls: config.maxLlmCalls,
        send: (request) => sendLoadRequest(started.url, request),
        messages,
      });
      console.log(formatReport(report));
      reports.push(report);
    }
    return reports;
  } finally {
    if (server) {
      try {
        await deleteLoadEntries(redis, cacheModel, messages);
      } catch {
        console.error("Cleanup of load-test cache entries failed.");
      }
      await server.app.close();
    }
    await quitRedis(redis);
  }
}

async function quitRedis(redis: CacheRedisClient): Promise<void> {
  if (redis.isOpen) {
    await redis.quit();
  }
}

function publicError(error: unknown): string {
  const message = error instanceof Error ? error.message : "Load test failed";
  return redact(message);
}

function redact(message: string): string {
  let text = message;
  for (const name of ["GEMINI_API_KEY", "REDIS_URL"]) {
    const secret = process.env[name]?.trim() ?? "";
    if (secret.length >= 8) {
      text = text.replaceAll(secret, "[redacted]");
    }
  }
  return text;
}
