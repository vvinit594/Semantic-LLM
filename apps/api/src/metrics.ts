import { DEFAULT_COST_RATES, costRatio, quoteCosts, type CostRates } from "@semantic-llm/evaluation";

export type CacheOutcome = "hit" | "miss";

export type LatencySample = {
  outcome: CacheOutcome;
  llmCalled: boolean;
  totalMs: number;
  cacheMs: number;
  llmMs: number;
  embeddingMs: number;
  redisMs: number;
  embeddingCalls: number;
  llmInputTokens: number;
  llmOutputTokens: number;
};

export type CostSnapshot = {
  embeddingUsd: number;
  redisUsd: number;
  llmInputUsd: number;
  llmOutputUsd: number;
  cacheHitUsd: number;
  llmRequestUsd: number;
  ratio: number | null;
};

export type MetricsSnapshot = {
  totalRequests: number;
  cacheHits: number;
  cacheMisses: number;
  hitRate: number;
  llmCalls: number;
  llmCallsAvoided: number;
  averageLatencyMs: {
    total: number;
    cache: number;
    llm: number;
  };
  cost: CostSnapshot;
};

export interface MetricsRecorder {
  record(sample: LatencySample): void;
  snapshot(): MetricsSnapshot;
}

const EMPTY_COST: CostSnapshot = {
  embeddingUsd: 0,
  redisUsd: 0,
  llmInputUsd: 0,
  llmOutputUsd: 0,
  cacheHitUsd: 0,
  llmRequestUsd: 0,
  ratio: null,
};

const EMPTY_SNAPSHOT: MetricsSnapshot = {
  totalRequests: 0,
  cacheHits: 0,
  cacheMisses: 0,
  hitRate: 0,
  llmCalls: 0,
  llmCallsAvoided: 0,
  averageLatencyMs: {
    total: 0,
    cache: 0,
    llm: 0,
  },
  cost: EMPTY_COST,
};

export class RequestMetrics implements MetricsRecorder {
  private totalRequests = 0;
  private cacheHits = 0;
  private cacheMisses = 0;
  private llmCalls = 0;
  private totalLatencyMs = 0;
  private cacheLatencyMs = 0;
  private llmLatencyMs = 0;
  private embeddingUsd = 0;
  private redisUsd = 0;
  private llmInputUsd = 0;
  private llmOutputUsd = 0;
  private cacheHitUsd = 0;
  private llmRequestUsd = 0;

  constructor(private readonly rates: CostRates = DEFAULT_COST_RATES) {}

  record(sample: LatencySample): void {
    if (!isUsableSample(sample)) {
      return;
    }

    const quote = quoteCosts(
      {
        embeddingMs: sample.embeddingMs,
        redisMs: sample.redisMs,
        llmMs: sample.llmCalled ? sample.llmMs : 0,
        embeddingCalls: sample.embeddingCalls,
        llmInputTokens: sample.llmCalled ? sample.llmInputTokens : 0,
        llmOutputTokens: sample.llmCalled ? sample.llmOutputTokens : 0,
      },
      this.rates,
    );

    this.totalRequests += 1;
    this.embeddingUsd += quote.embeddingUsd;
    this.redisUsd += quote.redisUsd;
    if (sample.outcome === "hit") {
      this.cacheHits += 1;
      this.cacheHitUsd += quote.cacheHitUsd;
    } else {
      this.cacheMisses += 1;
    }
    if (sample.llmCalled) {
      this.llmCalls += 1;
      this.llmLatencyMs += sample.llmMs;
      this.llmInputUsd += quote.llmInputUsd;
      this.llmOutputUsd += quote.llmOutputUsd;
      this.llmRequestUsd += quote.llmRequestUsd;
    }
    this.totalLatencyMs += sample.totalMs;
    this.cacheLatencyMs += sample.cacheMs;
  }

  snapshot(): MetricsSnapshot {
    if (this.totalRequests === 0) {
      return EMPTY_SNAPSHOT;
    }

    const averageHitUsd = this.cacheHits === 0 ? 0 : this.cacheHitUsd / this.cacheHits;
    const averageLlmUsd = this.llmCalls === 0 ? 0 : this.llmRequestUsd / this.llmCalls;

    return {
      totalRequests: this.totalRequests,
      cacheHits: this.cacheHits,
      cacheMisses: this.cacheMisses,
      hitRate: this.cacheHits / this.totalRequests,
      llmCalls: this.llmCalls,
      llmCallsAvoided: this.cacheHits,
      averageLatencyMs: {
        total: this.totalLatencyMs / this.totalRequests,
        cache: this.cacheLatencyMs / this.totalRequests,
        llm: this.llmCalls === 0 ? 0 : this.llmLatencyMs / this.llmCalls,
      },
      cost: {
        embeddingUsd: this.embeddingUsd,
        redisUsd: this.redisUsd,
        llmInputUsd: this.llmInputUsd,
        llmOutputUsd: this.llmOutputUsd,
        cacheHitUsd: this.cacheHitUsd,
        llmRequestUsd: this.llmRequestUsd,
        ratio:
          this.cacheHits === 0 || this.llmCalls === 0
            ? null
            : costRatio(averageHitUsd, averageLlmUsd),
      },
    };
  }
}

function isUsableSample(sample: LatencySample): boolean {
  return (
    (sample.outcome === "hit" || sample.outcome === "miss") &&
    isDuration(sample.totalMs) &&
    isDuration(sample.cacheMs) &&
    isDuration(sample.llmMs) &&
    isDuration(sample.embeddingMs) &&
    isDuration(sample.redisMs) &&
    Number.isInteger(sample.embeddingCalls) &&
    sample.embeddingCalls >= 0 &&
    isDuration(sample.llmInputTokens) &&
    isDuration(sample.llmOutputTokens)
  );
}

function isDuration(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}
