import { decideCache, type CacheDecision } from "@semantic-llm/decision";
import { caseMetadata, type DatasetCategory, type EvaluationCase } from "./dataset";
import { CANDIDATE_THRESHOLDS } from "./probes";
import { costRatio, quoteCosts, type CostQuote } from "./cost";

/** Matches the API default. The benchmark reports it and does not change it. */
export const PRODUCTION_THRESHOLD = 0.85;

/** Output size of the measured Gemini 3.8 Flash call on 2026-10-02. Input tokens are estimated per question. */
export const REPRESENTATIVE_LLM_OUTPUT_TOKENS = 64;

export type StoredCandidate = {
  id: string;
  query: string;
  response: string;
  model: string;
  language: string;
  scope: string;
  expiresAt: string;
};

export type ScoredCase = {
  item: EvaluationCase;
  score: number;
  embeddingMs: number;
  redisMs: number;
  candidate: StoredCandidate;
};

export type CategoryResult = {
  category: DatasetCategory;
  cases: number;
  hits: number;
  misses: number;
  validHits: number;
  invalidHits: number;
  falseHits: number;
  falseMisses: number;
  hitRate: number;
  correctHitRate: number;
  falseHitRate: number;
  falseMissRate: number;
};

export type ThresholdResult = {
  threshold: number;
  hits: number;
  misses: number;
  validHits: number;
  invalidHits: number;
  falseHits: number;
  falseMisses: number;
  hitRate: number;
  correctHitRate: number;
  falseHitRate: number;
  falseMissRate: number;
  missRate: number;
  averageHitMs: number;
  averageMissMs: number;
  categories: CategoryResult[];
};

export type CaseResult = {
  id: string;
  category: DatasetCategory;
  expect: EvaluationCase["expect"];
  risk: EvaluationCase["risk"];
  score: number;
  embeddingMs: number;
  redisMs: number;
  decision: "hit" | "miss";
  reason: string;
  validHit: boolean;
  invalidHit: boolean;
  falseHit: boolean;
  falseMiss: boolean;
};

export type BenchmarkReport = {
  generatedAt: string;
  datasetVersion: 1;
  cases: number;
  embeddingModel: string;
  productionThreshold: typeof PRODUCTION_THRESHOLD;
  productionThresholdChanged: false;
  llmCalled: false;
  thresholds: ThresholdResult[];
  production: ThresholdResult;
  productionCases: CaseResult[];
  latencyMs: {
    averageEmbedding: number;
    averageRedis: number;
    averageHit: number;
    averageMiss: number;
  };
  cost: {
    embeddingApiUsdPerCall: 0;
    averageCacheHitUsd: number;
    averageLlmRequestUsd: number;
    ratio: number | null;
    representativeLlmOutputTokens: typeof REPRESENTATIVE_LLM_OUTPUT_TOKENS;
    hit: CostQuote | null;
    llm: CostQuote;
  };
  selection: {
    appliedThreshold: typeof PRODUCTION_THRESHOLD;
    changed: false;
    thresholdAtHighestCorrectHitRate: number | null;
  };
};

export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

export function decideLabeledCase(input: {
  scored: ScoredCase;
  threshold: number;
  now: Date;
}): CacheDecision {
  const metadata = caseMetadata(input.scored.item);
  return decideCache(
    {
      query: input.scored.item.query,
      model: metadata.requestModel,
      language: metadata.requestLanguage,
      scope: metadata.requestScope,
      threshold: input.threshold,
      now: input.now,
    },
    [
      {
        id: input.scored.candidate.id,
        query: input.scored.candidate.query,
        score: input.scored.score,
        response: input.scored.candidate.response,
        model: input.scored.candidate.model,
        language: input.scored.candidate.language,
        scope: input.scored.candidate.scope,
        expiresAt: input.scored.candidate.expiresAt,
      },
    ],
  );
}

export function buildBenchmarkReport(input: {
  generatedAt: string;
  embeddingModel: string;
  scored: readonly ScoredCase[];
  now: Date;
}): BenchmarkReport {
  const thresholds = CANDIDATE_THRESHOLDS.map((threshold) => summarizeThreshold(input.scored, threshold, input.now));
  const production = thresholds.find((row) => row.threshold === PRODUCTION_THRESHOLD);
  if (!production) {
    throw new Error("production threshold is missing from the candidate list");
  }
  const productionCases = input.scored.map((scored) => caseResult(scored, PRODUCTION_THRESHOLD, input.now));
  const hitRows = productionCases.filter((item) => item.decision === "hit");
  const averageEmbedding = mean(input.scored.map((item) => item.embeddingMs));
  const averageRedis = mean(input.scored.map((item) => item.redisMs));
  const hitQuote = averageHitQuote(hitRows);
  const llmQuote = averageLlmQuote(input.scored);
  const safe = thresholds.filter((row) => row.falseHitRate === 0);
  const bestCorrect = safe.reduce((best, row) => Math.max(best, row.correctHitRate), 0);
  const bestHit = safe
    .filter((row) => row.correctHitRate === bestCorrect)
    .reduce((best, row) => Math.max(best, row.hitRate), 0);
  const tied = safe.filter((row) => row.correctHitRate === bestCorrect && row.hitRate === bestHit);
  const best = tied.find((row) => row.threshold === PRODUCTION_THRESHOLD) ?? tied[0] ?? null;

  return {
    generatedAt: input.generatedAt,
    datasetVersion: 1,
    cases: input.scored.length,
    embeddingModel: input.embeddingModel,
    productionThreshold: PRODUCTION_THRESHOLD,
    productionThresholdChanged: false,
    llmCalled: false,
    thresholds,
    production,
    productionCases,
    latencyMs: {
      averageEmbedding,
      averageRedis,
      averageHit: production.averageHitMs,
      averageMiss: production.averageMissMs,
    },
    cost: {
      embeddingApiUsdPerCall: 0,
      averageCacheHitUsd: hitQuote?.cacheHitUsd ?? 0,
      averageLlmRequestUsd: llmQuote.llmRequestUsd,
      ratio: hitQuote ? costRatio(hitQuote.cacheHitUsd, llmQuote.llmRequestUsd) : null,
      representativeLlmOutputTokens: REPRESENTATIVE_LLM_OUTPUT_TOKENS,
      hit: hitQuote,
      llm: llmQuote,
    },
    selection: {
      appliedThreshold: PRODUCTION_THRESHOLD,
      changed: false,
      thresholdAtHighestCorrectHitRate: best?.threshold ?? null,
    },
  };
}

export function formatBenchmarkReport(report: BenchmarkReport): string {
  const lines = [
    "# Benchmark",
    "",
    `Generated ${report.generatedAt}. Local embedding model \`${report.embeddingModel}\`. ${report.cases} labeled cases from \`datasets/test-queries.json\`.`,
    "",
    `Production similarity threshold stays **${report.productionThreshold.toFixed(2)}**. This run does not change it.`,
    "",
    "Each case stores one cached question in Redis, searches with the new question, and decides with `decideCache`. Records use ids starting with `bench-` and are deleted when the run finishes. The LLM is not called. Input tokens are estimated as characters divided by 4. Output tokens use the measured Gemini 3.8 Flash size of 64.",
    "",
    "## Thresholds",
    "",
    "| Threshold | Hit rate | Correct hit rate | False hit rate | False miss rate | Miss rate | Avg hit ms | Avg miss ms |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ...report.thresholds.map((row) =>
      `| ${row.threshold.toFixed(2)} | ${num(row.hitRate)} | ${num(row.correctHitRate)} | ${num(row.falseHitRate)} | ${num(row.falseMissRate)} | ${num(row.missRate)} | ${num(row.averageHitMs)} | ${num(row.averageMissMs)} |`,
    ),
    "",
    "## Categories at 0.85",
    "",
    "| Category | Cases | Hit rate | False hits | False misses |",
    "| --- | --- | --- | --- | --- |",
    ...report.production.categories.map(
      (row) => `| ${row.category} | ${row.cases} | ${num(row.hitRate)} | ${row.falseHits} | ${row.falseMisses} |`,
    ),
    "",
    "## Latency",
    "",
    `| Measure | ms |`,
    `| --- | --- |`,
    `| Average embedding | ${num(report.latencyMs.averageEmbedding)} |`,
    `| Average Redis search | ${num(report.latencyMs.averageRedis)} |`,
    `| Average hit | ${num(report.latencyMs.averageHit)} |`,
    `| Average miss | ${num(report.latencyMs.averageMiss)} |`,
    "",
    "Hit and miss latency follow the request path. A time-sensitive question skips embedding and Redis, so its request time is 0. Other cases include the measured embedding and Redis search.",
    "",
    "## Cost",
    "",
    `| Cost | USD |`,
    `| --- | --- |`,
    `| Embedding API per call | 0 |`,
    `| Average cache hit | ${usd(report.cost.averageCacheHitUsd)} |`,
    `| Average LLM request | ${usd(report.cost.averageLlmRequestUsd)} |`,
    `| Ratio (LLM / hit) | ${report.cost.ratio === null ? "n/a" : num(report.cost.ratio)} |`,
    "",
    sameDecisions(report),
    "",
    `Applied threshold: ${report.selection.appliedThreshold.toFixed(2)}.`,
    "",
    "## False hits at 0.85",
    "",
    formatCaseList(report.productionCases.filter((item) => item.falseHit)),
    "",
    "## False misses at 0.85",
    "",
    formatCaseList(report.productionCases.filter((item) => item.falseMiss)),
    "",
  ];
  return lines.join("\n");
}

function summarizeThreshold(scored: readonly ScoredCase[], threshold: number, now: Date): ThresholdResult {
  const rows = scored.map((item) => caseResult(item, threshold, now));
  const hits = rows.filter((item) => item.decision === "hit");
  const misses = rows.filter((item) => item.decision === "miss");
  const expectedHits = rows.filter((item) => item.expect === "hit");
  const expectedMisses = rows.filter((item) => item.expect === "miss");
  const validHits = rows.filter((item) => item.validHit).length;
  const invalidHits = rows.filter((item) => item.invalidHit).length;
  const falseHits = rows.filter((item) => item.falseHit).length;
  const falseMisses = rows.filter((item) => item.falseMiss).length;
  const categories = [...new Set(rows.map((item) => item.category))].map((category) =>
    summarizeCategory(rows.filter((item) => item.category === category), category),
  );
  return {
    threshold,
    hits: hits.length,
    misses: misses.length,
    validHits,
    invalidHits,
    falseHits,
    falseMisses,
    hitRate: ratio(hits.length, rows.length),
    correctHitRate: ratio(validHits, expectedHits.length),
    falseHitRate: ratio(falseHits, expectedMisses.length),
    falseMissRate: ratio(falseMisses, expectedHits.length),
    missRate: ratio(misses.length, rows.length),
    averageHitMs: mean(hits.map((item) => item.embeddingMs + item.redisMs)),
    averageMissMs: mean(misses.map((item) => item.embeddingMs + item.redisMs)),
    categories,
  };
}

function summarizeCategory(rows: readonly CaseResult[], category: DatasetCategory): CategoryResult {
  const hits = rows.filter((item) => item.decision === "hit").length;
  const expectedHits = rows.filter((item) => item.expect === "hit").length;
  const expectedMisses = rows.filter((item) => item.expect === "miss").length;
  const validHits = rows.filter((item) => item.validHit).length;
  const falseHits = rows.filter((item) => item.falseHit).length;
  const falseMisses = rows.filter((item) => item.falseMiss).length;
  return {
    category,
    cases: rows.length,
    hits,
    misses: rows.length - hits,
    validHits,
    invalidHits: falseHits,
    falseHits,
    falseMisses,
    hitRate: ratio(hits, rows.length),
    correctHitRate: ratio(validHits, expectedHits),
    falseHitRate: ratio(falseHits, expectedMisses),
    falseMissRate: ratio(falseMisses, expectedHits),
  };
}

function caseResult(scored: ScoredCase, threshold: number, now: Date): CaseResult {
  const decision = decideLabeledCase({ scored, threshold, now });
  const hit = decision.decision === "hit";
  const expectedHit = scored.item.expect === "hit";
  return {
    id: scored.item.id,
    category: scored.item.category,
    expect: scored.item.expect,
    risk: scored.item.risk,
    score: scored.score,
    embeddingMs: pathMs(scored.item, scored.embeddingMs),
    redisMs: pathMs(scored.item, scored.redisMs),
    decision: hit ? "hit" : "miss",
    reason: decision.decision === "hit" ? "hit" : decision.reason === "guard" ? decision.guard : decision.reason,
    validHit: hit && expectedHit,
    invalidHit: hit && !expectedHit,
    falseHit: hit && !expectedHit,
    falseMiss: !hit && expectedHit,
  };
}

function pathMs(item: EvaluationCase, measured: number): number {
  return item.category === "time-sensitive" ? 0 : measured;
}

function averageHitQuote(hits: readonly CaseResult[]): CostQuote | null {
  if (hits.length === 0) {
    return null;
  }
  const quotes = hits.map((item) =>
    quoteCosts({
      embeddingMs: item.embeddingMs,
      redisMs: item.redisMs,
      llmMs: 0,
      embeddingCalls: 1,
      llmInputTokens: 0,
      llmOutputTokens: 0,
    }),
  );
  return averageQuote(quotes);
}

function averageLlmQuote(scored: readonly ScoredCase[]): CostQuote {
  const quotes = scored.map((item) =>
    quoteCosts({
      embeddingMs: 0,
      redisMs: 0,
      llmMs: 0,
      embeddingCalls: 0,
      llmInputTokens: estimateTokens(item.item.query),
      llmOutputTokens: REPRESENTATIVE_LLM_OUTPUT_TOKENS,
    }),
  );
  return averageQuote(quotes);
}

function averageQuote(quotes: readonly CostQuote[]): CostQuote {
  const total = quotes.length;
  const sum = quotes.reduce(
    (current, quote) => ({
      embeddingUsd: current.embeddingUsd + quote.embeddingUsd,
      redisUsd: current.redisUsd + quote.redisUsd,
      llmInputUsd: current.llmInputUsd + quote.llmInputUsd,
      llmOutputUsd: current.llmOutputUsd + quote.llmOutputUsd,
      llmComputeUsd: current.llmComputeUsd + quote.llmComputeUsd,
      cacheHitUsd: current.cacheHitUsd + quote.cacheHitUsd,
      llmRequestUsd: current.llmRequestUsd + quote.llmRequestUsd,
    }),
    {
      embeddingUsd: 0,
      redisUsd: 0,
      llmInputUsd: 0,
      llmOutputUsd: 0,
      llmComputeUsd: 0,
      cacheHitUsd: 0,
      llmRequestUsd: 0,
    },
  );
  return {
    embeddingUsd: sum.embeddingUsd / total,
    redisUsd: sum.redisUsd / total,
    llmInputUsd: sum.llmInputUsd / total,
    llmOutputUsd: sum.llmOutputUsd / total,
    llmComputeUsd: sum.llmComputeUsd / total,
    cacheHitUsd: sum.cacheHitUsd / total,
    llmRequestUsd: sum.llmRequestUsd / total,
  };
}

function sameDecisions(report: BenchmarkReport): string {
  const matching = report.thresholds.filter(
    (row) =>
      row.hitRate === report.production.hitRate &&
      row.correctHitRate === report.production.correctHitRate &&
      row.falseHitRate === report.production.falseHitRate &&
      row.falseMissRate === report.production.falseMissRate,
  );
  const listed = matching.map((row) => row.threshold.toFixed(2)).join(", ");
  if (matching.length <= 1) {
    return `Only ${report.production.threshold.toFixed(2)} has this false-hit rate and correct hit rate.`;
  }
  return `Thresholds ${listed} make the same decisions on this set. Production stays ${report.productionThreshold.toFixed(2)}.`;
}

function formatCaseList(cases: readonly CaseResult[]): string {
  if (cases.length === 0) {
    return "None.";
  }
  return cases.map((item) => `- ${item.id} (${item.category}, score ${num(item.score)})`).join("\n");
}

function mean(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function ratio(part: number, total: number): number {
  return total === 0 ? 0 : part / total;
}

function num(value: number): string {
  return value.toFixed(3);
}

function usd(value: number): string {
  if (value === 0) {
    return "0";
  }
  return value < 0.0001 ? value.toExponential(3) : value.toFixed(6);
}
