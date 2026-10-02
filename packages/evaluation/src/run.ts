import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { config as loadEnv } from "dotenv";
import { VectorCache, createRedisClient, type CacheRedisClient } from "@semantic-llm/cache";
import { EMBEDDING_MODEL, createLocalEmbeddingService } from "@semantic-llm/embeddings";
import { embeddingText } from "@semantic-llm/query";
import { buildBenchmarkReport, formatBenchmarkReport, type ScoredCase } from "./benchmark";
import { caseMetadata, loadDataset } from "./dataset";

const BENCHMARK_TTL_SECONDS = 60 * 60;
/** Matches the API default SEMANTIC_TOP_K. The labeled score still comes from the stored pair. */
const SEARCH_K = 5;

loadEnv({ path: resolve(import.meta.dirname, "../../../.env"), quiet: true });

export function resultsPath(): string {
  return resolve(import.meta.dirname, "../../../datasets/evaluation-results.json");
}

export function markdownPath(): string {
  return resolve(import.meta.dirname, "../../../docs/benchmark.md");
}

export async function runBenchmark(): Promise<void> {
  const dataset = loadDataset();
  const baseUrl = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";
  const redis = createRedisClient(baseUrl);
  redis.on("error", () => {});
  const embeddings = createLocalEmbeddingService();

  await connectRedis(redis);
  try {
    await deleteBenchmarkKeys(redis);
    await embeddings.init();
    await embeddings.embed(embeddingText("warmup"));
    const vectors = new VectorCache(redis);
    const embedded = new Map<string, { vector: number[]; ms: number }>();

    for (const item of dataset.cases) {
      await embedTimed(embeddings, item.cachedQuery, embedded);
      await embedTimed(embeddings, item.query, embedded);
    }

    for (const item of dataset.cases) {
      const id = `bench-${item.id}`;
      const cached = embedded.get(embeddingText(item.cachedQuery));
      if (!cached) {
        throw new Error(`missing embedding for ${item.id}`);
      }
      const metadata = caseMetadata(item);
      await vectors.upsert({
        id,
        query: item.cachedQuery,
        embedding: cached.vector,
        response: "benchmark-cached-answer",
        model: metadata.cachedModel,
        language: metadata.cachedLanguage,
        ttlSeconds: BENCHMARK_TTL_SECONDS,
        metadata: { scope: metadata.cachedScope },
      });
    }

    const now = new Date();
    const scored: ScoredCase[] = [];
    for (const item of dataset.cases) {
      const id = `bench-${item.id}`;
      const cachedEmbedding = embedded.get(embeddingText(item.cachedQuery));
      const queryEmbedding = embedded.get(embeddingText(item.query));
      if (!cachedEmbedding || !queryEmbedding) {
        throw new Error(`missing embedding for ${item.id}`);
      }
      const started = performance.now();
      const neighbors = await vectors.search(queryEmbedding.vector, SEARCH_K);
      const redisMs = elapsedMs(started);
      const neighbor = neighbors.find((candidate) => candidate.id === id);
      const cosine = dot(cachedEmbedding.vector, queryEmbedding.vector);
      if (neighbor && Math.abs(neighbor.score - cosine) > 0.02) {
        throw new Error(`Redis score for ${id} does not match the embedding cosine`);
      }
      const record = neighbor ?? (await vectors.get(id));
      if (!record) {
        throw new Error(`Redis is missing ${id}`);
      }
      const stored = "record" in record ? record.record : record;
      scored.push({
        item,
        score: neighbor?.score ?? cosine,
        embeddingMs: queryEmbedding.ms,
        redisMs,
        candidate: {
          id,
          query: stored.query,
          response: stored.response,
          model: stored.model,
          language: stored.language,
          scope: stored.metadata.scope ?? "",
          expiresAt: stored.expiresAt,
        },
      });
    }

    const report = buildBenchmarkReport({
      generatedAt: now.toISOString(),
      embeddingModel: EMBEDDING_MODEL,
      scored,
      now,
    });
    writeReport(resultsPath(), `${JSON.stringify(report, null, 2)}\n`);
    writeReport(markdownPath(), formatBenchmarkReport(report));
    console.log(`Wrote ${resultsPath()}`);
    console.log(`Wrote ${markdownPath()}`);
    console.log(
      `threshold ${report.productionThreshold.toFixed(2)} hit rate ${report.production.hitRate.toFixed(3)} false hits ${report.production.falseHits} false misses ${report.production.falseMisses} ratio ${report.cost.ratio === null ? "n/a" : report.cost.ratio.toFixed(1)}`,
    );
  } finally {
    try {
      await deleteBenchmarkKeys(redis);
    } catch {
      // Leave the original failure intact. Keys also expire with the benchmark TTL.
    }
    if (redis.isOpen) {
      await redis.quit();
    }
  }
}

async function embedTimed(
  embeddings: { embed(text: string): Promise<number[]> },
  text: string,
  cache: Map<string, { vector: number[]; ms: number }>,
): Promise<void> {
  const key = embeddingText(text);
  if (cache.has(key)) {
    return;
  }
  const started = performance.now();
  const vector = await embeddings.embed(key);
  cache.set(key, { vector, ms: elapsedMs(started) });
}

function dot(left: readonly number[], right: readonly number[]): number {
  let sum = 0;
  for (let index = 0; index < left.length; index += 1) {
    sum += (left[index] ?? 0) * (right[index] ?? 0);
  }
  return sum;
}

async function deleteBenchmarkKeys(redis: CacheRedisClient): Promise<void> {
  let cursor = "0";
  do {
    const page = await redis.scan(cursor, { MATCH: "semantic:bench-*", COUNT: 200 });
    cursor = page.cursor;
    if (page.keys.length > 0) {
      await redis.del(page.keys);
    }
  } while (cursor !== "0");
}

async function connectRedis(redis: { connect(): Promise<unknown>; isOpen: boolean }): Promise<void> {
  const timeout = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error("Redis connection timed out")), 5_000);
  });
  await Promise.race([redis.connect(), timeout]);
}

function writeReport(path: string, contents: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents, "utf8");
}

function elapsedMs(started: number): number {
  const value = performance.now() - started;
  return Number.isFinite(value) && value > 0 ? value : 0;
}
