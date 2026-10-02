import { DEFAULT_COST_RATES, costRatio, quoteCosts, type CostRates } from "@semantic-llm/evaluation";

export type CacheOutcome = "hit" | "miss";
export type CacheMatch = "exact" | "semantic";
export type MissReason =
  | "no-candidate"
  | "below-threshold"
  | "metadata"
  | "stale"
  | "guard"
  | "unavailable"
  | "time-sensitive";
export type SafetyGuardName = "entity" | "number" | "time";

const MISS_REASONS = new Set<MissReason>([
  "no-candidate",
  "below-threshold",
  "metadata",
  "stale",
  "guard",
  "unavailable",
  "time-sensitive",
]);
const SAFETY_GUARDS = new Set<SafetyGuardName>(["entity", "number", "time"]);

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
  match?: CacheMatch;
  missReason?: MissReason;
  guard?: SafetyGuardName;
};

export type MissReasonCount = {
  reason: MissReason;
  guard?: SafetyGuardName;
  count: number;
};

export type CostSnapshot = {
  embeddingUsd: number;
  redisUsd: number;
  llmInputUsd: number;
  llmOutputUsd: number;
  cacheHitUsd: number;
  llmRequestUsd: number;
  averageCacheHitUsd: number;
  averageLlmRequestUsd: number;
  savingsUsd: number | null;
  ratio: number | null;
};

export type MetricsSnapshot = {
  totalRequests: number;
  cacheHits: number;
  cacheMisses: number;
  exactHits: number;
  semanticHits: number;
  hitRate: number;
  llmCalls: number;
  llmCallsAvoided: number;
  averageLatencyMs: {
    total: number;
    cache: number;
    llm: number;
    hit: number;
    miss: number;
    embedding: number;
    redis: number;
  };
  missReasons: MissReasonCount[];
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
  averageCacheHitUsd: 0,
  averageLlmRequestUsd: 0,
  savingsUsd: null,
  ratio: null,
};

const EMPTY_SNAPSHOT: MetricsSnapshot = {
  totalRequests: 0,
  cacheHits: 0,
  cacheMisses: 0,
  exactHits: 0,
  semanticHits: 0,
  hitRate: 0,
  llmCalls: 0,
  llmCallsAvoided: 0,
  averageLatencyMs: {
    total: 0,
    cache: 0,
    llm: 0,
    hit: 0,
    miss: 0,
    embedding: 0,
    redis: 0,
  },
  missReasons: [],
  cost: EMPTY_COST,
};

export class RequestMetrics implements MetricsRecorder {
  private totalRequests = 0;
  private cacheHits = 0;
  private cacheMisses = 0;
  private exactHits = 0;
  private semanticHits = 0;
  private llmCalls = 0;
  private totalLatencyMs = 0;
  private cacheLatencyMs = 0;
  private llmLatencyMs = 0;
  private hitLatencyMs = 0;
  private missLatencyMs = 0;
  private embeddingLatencyMs = 0;
  private embeddingSamples = 0;
  private redisLatencyMs = 0;
  private readonly missReasonCounts = new Map<string, MissReasonCount>();
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
      this.hitLatencyMs += sample.totalMs;
      this.cacheHitUsd += quote.cacheHitUsd;
      if (sample.match === "exact") {
        this.exactHits += 1;
      } else if (sample.match === "semantic") {
        this.semanticHits += 1;
      }
    } else {
      this.cacheMisses += 1;
      this.missLatencyMs += sample.totalMs;
      rememberMiss(this.missReasonCounts, sample);
    }
    if (sample.embeddingCalls > 0) {
      this.embeddingLatencyMs += sample.embeddingMs;
      this.embeddingSamples += 1;
    }
    this.redisLatencyMs += sample.redisMs;
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
      exactHits: this.exactHits,
      semanticHits: this.semanticHits,
      hitRate: this.cacheHits / this.totalRequests,
      llmCalls: this.llmCalls,
      llmCallsAvoided: this.cacheHits,
      averageLatencyMs: {
        total: this.totalLatencyMs / this.totalRequests,
        cache: this.cacheLatencyMs / this.totalRequests,
        llm: this.llmCalls === 0 ? 0 : this.llmLatencyMs / this.llmCalls,
        hit: this.cacheHits === 0 ? 0 : this.hitLatencyMs / this.cacheHits,
        miss: this.cacheMisses === 0 ? 0 : this.missLatencyMs / this.cacheMisses,
        embedding: this.embeddingSamples === 0 ? 0 : this.embeddingLatencyMs / this.embeddingSamples,
        redis: this.redisLatencyMs / this.totalRequests,
      },
      missReasons: [...this.missReasonCounts.values()].sort(compareMissReasons),
      cost: {
        embeddingUsd: this.embeddingUsd,
        redisUsd: this.redisUsd,
        llmInputUsd: this.llmInputUsd,
        llmOutputUsd: this.llmOutputUsd,
        cacheHitUsd: this.cacheHitUsd,
        llmRequestUsd: this.llmRequestUsd,
        averageCacheHitUsd: averageHitUsd,
        averageLlmRequestUsd: averageLlmUsd,
        savingsUsd: this.llmCalls === 0 ? null : this.cacheHits * averageLlmUsd,
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
    isDuration(sample.llmOutputTokens) &&
    (sample.match === undefined || sample.match === "exact" || sample.match === "semantic") &&
    (sample.missReason === undefined || MISS_REASONS.has(sample.missReason)) &&
    (sample.guard === undefined || SAFETY_GUARDS.has(sample.guard)) &&
    (sample.guard === undefined || sample.missReason === "guard")
  );
}

function rememberMiss(counts: Map<string, MissReasonCount>, sample: LatencySample): void {
  if (sample.missReason === undefined) {
    return;
  }
  const guard = sample.missReason === "guard" ? sample.guard : undefined;
  const key = guard ? `${sample.missReason}:${guard}` : sample.missReason;
  const current = counts.get(key);
  if (current) {
    current.count += 1;
    return;
  }
  counts.set(key, {
    reason: sample.missReason,
    count: 1,
    ...(guard ? { guard } : {}),
  });
}

function compareMissReasons(left: MissReasonCount, right: MissReasonCount): number {
  return right.count - left.count || left.reason.localeCompare(right.reason) || (left.guard ?? "").localeCompare(right.guard ?? "");
}

function isDuration(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}
