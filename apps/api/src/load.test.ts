import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { ExactCache, VectorCache, createRedisClient, type CacheRedisClient } from "@semantic-llm/cache";
import { embeddingText } from "@semantic-llm/query";
import "./load-env";
import { startStubServer } from "./load/app";
import { deleteLoadEntries } from "./load/cleanup";
import { sendLoadRequest } from "./load/http";
import {
  LoadPlanError,
  measuredRequest,
  parseLoadArgs,
  plannedLlmCalls,
  selectScenarios,
  type LoadConfig,
} from "./load/plan";
import { runScenario } from "./load/run";
import { percentile, summarize } from "./load/stats";
import { HashEmbeddings } from "./test-vectors";

test("percentiles use nearest rank and the summary counts hits, errors, and avoided calls", () => {
  assert.equal(percentile([40, 10, 30, 20], 50), 20);
  assert.equal(percentile([10, 20, 30, 40], 100), 40);
  assert.equal(percentile([], 95), null);

  const report = summarize({
    scenario: "mixed",
    mode: "safe",
    concurrency: 4,
    elapsedMs: 2_000,
    warmupLlmCalls: 1,
    measuredLlmCalls: 1,
    stoppedEarly: false,
    samples: [
      { kind: "chat", ok: true, cached: true, match: "exact", latencyMs: 10 },
      { kind: "chat", ok: true, cached: true, match: "semantic", latencyMs: 30 },
      { kind: "chat", ok: true, cached: false, match: null, latencyMs: 40 },
      { kind: "chat", ok: false, cached: null, match: null, latencyMs: 50 },
    ],
  });

  assert.equal(report.completed, 4);
  assert.equal(report.errors, 1);
  assert.equal(report.errorRate, 0.25);
  assert.equal(report.requestsPerSecond, 2);
  assert.equal(report.throughputPerSecond, 2);
  assert.equal(report.latencyMs.p50, 30);
  assert.equal(report.exactHits, 1);
  assert.equal(report.semanticHits, 1);
  assert.equal(report.misses, 1);
  assert.equal(report.hitRate, 2 / 3);
  assert.equal(report.llmCalls, 2);
  assert.equal(report.llmCallsAvoided, 2);
});

test("the plan repeats exact hits, rotates paraphrases, and keeps miss questions unique", () => {
  const exact = measuredRequest("exact-hit", "run", 3, 16);
  const again = measuredRequest("exact-hit", "run", 4, 16);
  const paraphrase = measuredRequest("semantic-hit", "run", 0, 16);
  const firstMiss = measuredRequest("miss", "run", 0, 16);
  const secondMiss = measuredRequest("miss", "run", 1, 16);
  assert.equal(exact.kind, "chat");
  assert.equal(again.kind, "chat");
  assert.equal(paraphrase.kind, "chat");
  assert.equal(firstMiss.kind, "chat");
  assert.equal(secondMiss.kind, "chat");
  if (exact.kind === "chat" && again.kind === "chat" && paraphrase.kind === "chat" && firstMiss.kind === "chat" && secondMiss.kind === "chat") {
    assert.equal(exact.message, again.message);
    assert.equal(paraphrase.message, "Which city is the capital of France?");
    assert.notEqual(firstMiss.message, secondMiss.message);
  }

  let misses = 0;
  for (let index = 0; index < 10; index += 1) {
    const request = measuredRequest("mixed", "run", index, 16);
    if (request.kind === "chat" && request.message.startsWith("Load mixed")) {
      misses += 1;
    }
  }
  assert.equal(misses, 2);
  assert.deepEqual(plannedLlmCalls("semantic-hit", 1_000, 16), { warmup: 5, measured: 0 });
  assert.deepEqual(plannedLlmCalls("miss", 10, 16), { warmup: 0, measured: 10 });
});

test("live Gemini traffic stays off unless it is requested and inside the call ceiling", () => {
  assert.throws(() => selectScenarios(config({ mode: "live", scenario: "miss" })), LoadPlanError);
  assert.throws(
    () => selectScenarios(config({ mode: "live", scenario: "miss", allowLlm: true, requests: 40, maxLlmCalls: 25 })),
    /above --max-llm-calls/,
  );
  assert.throws(
    () => selectScenarios(config({ mode: "live", scenario: "miss", allowLlm: true, requests: undefined, durationMs: 10_000 })),
    /needs --requests/,
  );

  const limited = selectScenarios(config({ mode: "live", scenario: "miss", allowLlm: true, requests: 10, maxLlmCalls: 10 }));
  assert.deepEqual(limited.run, ["miss"]);

  const liveAll = selectScenarios(config({ mode: "live", scenario: "all" }));
  assert.deepEqual(liveAll.run, ["exact-hit", "semantic-hit"]);
  assert.deepEqual(liveAll.skipped.map((item) => item.scenario), ["miss", "redis", "mixed"]);

  const safe = selectScenarios(config({ mode: "safe", scenario: "all" }));
  assert.equal(safe.run.length, 5);
  assert.equal(safe.skipped.length, 0);
});

test("duration and request flags parse without turning safe mode into a live run", () => {
  const timed = parseLoadArgs(["--duration=2s", "--concurrency=4"]);
  assert.equal(timed.mode, "safe");
  assert.equal(timed.durationMs, 2_000);
  assert.equal(timed.requests, undefined);

  const both = parseLoadArgs(["--requests=12", "--duration=500ms", "--scenario=redis"]);
  assert.equal(both.requests, 12);
  assert.equal(both.durationMs, 500);
  assert.equal(both.scenario, "redis");
});

test("a safe server measures exact hits, Redis reads, and misses without a real LLM", async () => {
  const runId = `load-${crypto.randomUUID()}`;
  const model = `load-${runId}`;
  const cacheModel = `stub:${model}`;
  const embeddings = new HashEmbeddings();
  const messages = new Set<string>();
  const server = await startStubServer({ redis, embeddings, model });

  try {
    const exact = await runScenario({
      scenario: "exact-hit",
      mode: "safe",
      concurrency: 4,
      requests: 12,
      durationMs: undefined,
      runId,
      workingSet: 4,
      maxLlmCalls: 25,
      send: (request) => sendLoadRequest(server.url, request),
      messages,
    });
    const redisReads = await runScenario({
      scenario: "redis",
      mode: "safe",
      concurrency: 4,
      requests: 8,
      durationMs: undefined,
      runId,
      workingSet: 4,
      maxLlmCalls: 25,
      send: (request) => sendLoadRequest(server.url, request),
      messages,
    });
    const misses = await runScenario({
      scenario: "miss",
      mode: "safe",
      concurrency: 4,
      requests: 6,
      durationMs: undefined,
      runId,
      workingSet: 4,
      maxLlmCalls: 25,
      send: (request) => sendLoadRequest(server.url, request),
      messages,
    });

    assert.equal(exact.errors, 0);
    assert.equal(exact.hitRate, 1);
    assert.equal(exact.exactHits, 12);
    assert.equal(exact.llmCalls, 1);
    assert.equal(exact.llmCallsAvoided, 12);
    assert.equal(redisReads.hitRate, 1);
    assert.equal(redisReads.exactHits, 8);
    assert.equal(redisReads.llmCalls, 4);
    assert.equal(redisReads.llmCallsAvoided, 8);
    assert.equal(misses.hitRate, 0);
    assert.equal(misses.misses, 6);
    assert.equal(misses.llmCalls, 6);
    assert.equal(misses.llmCallsAvoided, 0);
    assert.equal(server.llm.calls, 11);
    assert.ok((exact.requestsPerSecond ?? 0) > 0);
    assert.ok((exact.latencyMs.p95 ?? 0) >= (exact.latencyMs.p50 ?? 0));
  } finally {
    await deleteLoadEntries(redis, cacheModel, messages);
    const cache = new ExactCache(redis, 120);
    for (const message of messages) {
      assert.equal(await cache.get(message, cacheModel), undefined);
    }
    const vectors = new VectorCache(redis);
    for (const message of messages) {
      const candidates = await vectors.search(await embeddings.embed(embeddingText(message)), 5);
      assert.equal(candidates.some((candidate) => candidate.record.model === cacheModel), false);
    }
    await server.app.close();
  }
});

const redisUrl = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";
let redis: CacheRedisClient;

before(async () => {
  redis = createRedisClient(redisUrl);
  redis.on("error", () => {});
  await redis.connect();
});

after(async () => {
  if (redis?.isOpen) {
    await redis.quit();
  }
});

function config(overrides: Partial<LoadConfig>): LoadConfig {
  return {
    mode: "safe",
    scenario: "all",
    concurrency: 4,
    requests: 10,
    durationMs: undefined,
    allowLlm: false,
    maxLlmCalls: 25,
    url: "http://127.0.0.1:3001",
    workingSet: 16,
    outPath: undefined,
    ...overrides,
  };
}
