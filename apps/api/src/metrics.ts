export type CacheOutcome = "hit" | "miss";

export type LatencySample = {
  outcome: CacheOutcome;
  llmCalled: boolean;
  totalMs: number;
  cacheMs: number;
  llmMs: number;
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
};

export interface MetricsRecorder {
  record(sample: LatencySample): void;
  snapshot(): MetricsSnapshot;
}

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
};

export class RequestMetrics implements MetricsRecorder {
  private totalRequests = 0;
  private cacheHits = 0;
  private cacheMisses = 0;
  private llmCalls = 0;
  private totalLatencyMs = 0;
  private cacheLatencyMs = 0;
  private llmLatencyMs = 0;

  record(sample: LatencySample): void {
    if (!isUsableSample(sample)) {
      return;
    }

    this.totalRequests += 1;
    if (sample.outcome === "hit") {
      this.cacheHits += 1;
    } else {
      this.cacheMisses += 1;
    }
    if (sample.llmCalled) {
      this.llmCalls += 1;
      this.llmLatencyMs += sample.llmMs;
    }
    this.totalLatencyMs += sample.totalMs;
    this.cacheLatencyMs += sample.cacheMs;
  }

  snapshot(): MetricsSnapshot {
    if (this.totalRequests === 0) {
      return EMPTY_SNAPSHOT;
    }

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
    };
  }
}

function isUsableSample(sample: LatencySample): boolean {
  return (
    (sample.outcome === "hit" || sample.outcome === "miss") &&
    isDuration(sample.totalMs) &&
    isDuration(sample.cacheMs) &&
    isDuration(sample.llmMs)
  );
}

function isDuration(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}
