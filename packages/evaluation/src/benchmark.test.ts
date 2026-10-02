import assert from "node:assert/strict";
import { test } from "node:test";
import {
  PRODUCTION_THRESHOLD,
  buildBenchmarkReport,
  decideLabeledCase,
  formatBenchmarkReport,
  type ScoredCase,
} from "./benchmark";
import { loadDataset } from "./dataset";

const now = new Date("2026-10-02T00:00:00.000Z");
const expiresAt = "2026-10-03T00:00:00.000Z";

test("the benchmark keeps the production threshold and prices a hit without an LLM call", () => {
  const report = buildBenchmarkReport({
    generatedAt: "2026-10-02T00:00:00.000Z",
    embeddingModel: "all-MiniLM-L6-v2",
    now,
    scored: [
      scored("france-paraphrase", "paraphrase", "hit", "false-miss", "What is the capital of France?", "Which city is the capital of France?", 0.97, 10, 2),
      scored("india-china", "entity-mismatch", "miss", "false-hit", "What is the capital of India?", "What is the capital of China?", 0.99, 10, 2),
      scored("learning-paraphrase", "paraphrase", "hit", "false-miss", "What is machine learning?", "Can you explain machine learning?", 0.5, 8, 1),
    ],
  });

  assert.equal(report.productionThreshold, PRODUCTION_THRESHOLD);
  assert.equal(report.productionThresholdChanged, false);
  assert.equal(report.selection.changed, false);
  assert.equal(report.llmCalled, false);
  assert.equal(report.cost.embeddingApiUsdPerCall, 0);
  assert.equal(report.production.falseHits, 0);
  assert.equal(report.production.falseMisses, 1);
  assert.equal(report.productionCases.find((item) => item.id === "india-china")?.reason, "entity");
  assert.equal(report.cost.hit?.llmRequestUsd, 0);
  assert.ok((report.cost.ratio ?? 0) > 0);
  const markdown = formatBenchmarkReport(report);
  assert.match(markdown, /Production similarity threshold stays \*\*0\.85\*\*/);
  assert.match(markdown, /learning-paraphrase/);
  assert.doesNotMatch(markdown, /threshold updated/);
});

test("time, metadata, and number guards miss even at a perfect score", () => {
  const dataset = loadDataset();
  for (const id of ["latest-news", "model-mismatch", "language-mismatch", "scope-mismatch", "two-plus-three"]) {
    const item = dataset.cases.find((entry) => entry.id === id);
    assert.ok(item);
    const decision = decideLabeledCase({
      scored: {
        item,
        score: 1,
        embeddingMs: 1,
        redisMs: 1,
        candidate: {
          id: `bench-${item.id}`,
          query: item.cachedQuery,
          response: "benchmark-cached-answer",
          model: item.cached?.model ?? "gemini:gemini-3.8-flash",
          language: item.cached?.language ?? "en",
          scope: item.cached?.scope ?? "public",
          expiresAt,
        },
      },
      threshold: PRODUCTION_THRESHOLD,
      now,
    });
    assert.equal(decision.decision, "miss", id);
  }
});

function scored(
  id: string,
  category: ScoredCase["item"]["category"],
  expect: ScoredCase["item"]["expect"],
  risk: ScoredCase["item"]["risk"],
  cachedQuery: string,
  query: string,
  score: number,
  embeddingMs: number,
  redisMs: number,
): ScoredCase {
  return {
    item: { id, category, cachedQuery, query, expect, risk },
    score,
    embeddingMs,
    redisMs,
    candidate: {
      id: `bench-${id}`,
      query: cachedQuery,
      response: "benchmark-cached-answer",
      model: "gemini:gemini-3.8-flash",
      language: "en",
      scope: "public",
      expiresAt,
    },
  };
}
