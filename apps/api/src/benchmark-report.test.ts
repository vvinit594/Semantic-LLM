import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import type { ExactCache, CacheRedisClient } from "@semantic-llm/cache";
import type { EmbeddingService } from "@semantic-llm/embeddings";
import type { LLMProvider } from "@semantic-llm/llm";
import { buildApp } from "./app";
import { BenchmarkReportError, parseBenchmarkReport } from "./benchmark-report";

const apps: Array<{ close: () => Promise<void> }> = [];

after(async () => {
  await Promise.all(apps.map((app) => app.close()));
});

test("the benchmark view keeps summary fields and drops case text", () => {
  const view = parseBenchmarkReport(fixture());
  assert.equal(view.productionThreshold, 0.85);
  assert.equal(view.productionThresholdChanged, false);
  assert.equal(view.hitRate, 0.5);
  assert.equal(view.falseHits, 0);
  assert.equal(view.falseMisses, 1);
  assert.equal(view.costRatio, 200);
  assert.deepEqual(view.categories, [
    { category: "paraphrase", cases: 2, hitRate: 0.5, falseHits: 0, falseMisses: 1 },
  ]);
  assert.equal(JSON.stringify(view).includes("should not be returned"), false);
});

test("a benchmark report with a missing field is rejected", () => {
  const broken = fixture();
  delete broken.cost;
  assert.throws(() => parseBenchmarkReport(broken), BenchmarkReportError);
});

test("GET /api/benchmark returns the saved report and a missing file is a 404", async () => {
  const directory = await mkdtemp(join(tmpdir(), "semantic-benchmark-"));
  const path = join(directory, "evaluation-results.json");
  await writeFile(path, JSON.stringify(fixture()));
  const app = testApp(path);
  apps.push(app);

  const missingApp = testApp(join(directory, "missing.json"));
  apps.push(missingApp);
  const found = await app.inject({ method: "GET", url: "/api/benchmark" });
  const missing = await missingApp.inject({
    method: "GET",
    url: "/api/benchmark",
  });

  assert.equal(found.statusCode, 200);
  assert.equal(found.json().hitRate, 0.5);
  assert.equal(found.json().thresholds[1].threshold, 0.85);
  assert.equal(JSON.stringify(found.json()).includes("GEMINI_API_KEY"), false);
  assert.equal(JSON.stringify(found.json()).includes("should not be returned"), false);
  assert.equal(missing.statusCode, 404);
  assert.deepEqual(missing.json(), { error: "No benchmark report is available." });
});

function fixture(): Record<string, unknown> {
  return {
    generatedAt: "2026-10-02T10:18:10.815Z",
    cases: 2,
    embeddingModel: "all-MiniLM-L6-v2",
    productionThreshold: 0.85,
    productionThresholdChanged: false,
    production: {
      hitRate: 0.5,
      correctHitRate: 1,
      falseHits: 0,
      falseMisses: 1,
      categories: [{ category: "paraphrase", cases: 2, hitRate: 0.5, falseHits: 0, falseMisses: 1 }],
    },
    thresholds: [
      { threshold: 0.8, hitRate: 0.5, correctHitRate: 1, falseHits: 0, falseMisses: 1 },
      { threshold: 0.85, hitRate: 0.5, correctHitRate: 1, falseHits: 0, falseMisses: 1 },
    ],
    cost: { averageCacheHitUsd: 0.000001, averageLlmRequestUsd: 0.0002, ratio: 200 },
    productionCases: [{ query: "should not be returned" }],
  };
}

function testApp(benchmarkReportPath: string) {
  return buildApp({
    llm: { name: "fake", async complete() { return "ok"; } } as LLMProvider,
    cache: {} as ExactCache,
    vectors: { async search() { return []; }, async upsert() { return {}; } },
    embeddings: {
      model: "fake",
      dimensions: 384,
      async init() {},
      async embed() { return []; },
    } as EmbeddingService,
    redis: { isOpen: false, async quit() {} } as unknown as CacheRedisClient,
    model: "test",
    ttlSeconds: 60,
    logger: false,
    closeRedis: false,
    benchmarkReportPath,
  });
}
