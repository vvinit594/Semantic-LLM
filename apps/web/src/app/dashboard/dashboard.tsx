"use client";

import { useEffect, useState } from "react";
import { SiteHeader } from "../site-header";
import { CardGrid, MetricCard, Panel, Section } from "./cards";
import { BarChart } from "./charts";
import { formatCategory, formatCount, formatMs, formatPercent, formatRatio, formatUsd } from "./format";

type MissReasonCount = {
  reason: string;
  guard?: string;
  count: number;
};

type MetricsSnapshot = {
  totalRequests: number;
  cacheHits: number;
  cacheMisses: number;
  exactHits: number;
  semanticHits: number;
  hitRate: number;
  llmCalls: number;
  llmCallsAvoided: number;
  averageLatencyMs: {
    hit: number;
    miss: number;
    embedding: number;
    redis: number;
    llm: number;
  };
  missReasons: MissReasonCount[];
  cost: {
    averageCacheHitUsd: number;
    averageLlmRequestUsd: number;
    savingsUsd: number | null;
    ratio: number | null;
  };
};

type BenchmarkCategory = {
  category: string;
  cases: number;
  hitRate: number;
  falseHits: number;
  falseMisses: number;
};

type BenchmarkThreshold = {
  threshold: number;
  hitRate: number;
  correctHitRate: number;
  falseHits: number;
  falseMisses: number;
};

type BenchmarkDashboard = {
  generatedAt: string;
  cases: number;
  embeddingModel: string;
  productionThreshold: number;
  productionThresholdChanged: boolean;
  hitRate: number;
  correctHitRate: number;
  falseHits: number;
  falseMisses: number;
  categories: BenchmarkCategory[];
  thresholds: BenchmarkThreshold[];
  costRatio: number | null;
  averageCacheHitUsd: number;
  averageLlmRequestUsd: number;
};

export function Dashboard({ apiUrl }: { apiUrl: string }) {
  const [metrics, setMetrics] = useState<MetricsSnapshot | null>(null);
  const [metricsError, setMetricsError] = useState<string | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [benchmark, setBenchmark] = useState<BenchmarkDashboard | null>(null);
  const [benchmarkMissing, setBenchmarkMissing] = useState(false);
  const [benchmarkError, setBenchmarkError] = useState<string | null>(null);
  const [benchmarkLoading, setBenchmarkLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    void requestMetrics(apiUrl, controller.signal).then((result) => {
      if (controller.signal.aborted) {
        return;
      }
      if (result.ok) {
        setMetrics(result.metrics);
        setMetricsError(null);
      } else {
        setMetricsError(result.error);
      }
      setMetricsLoading(false);
    });
    void requestBenchmark(apiUrl, controller.signal).then((result) => {
      if (controller.signal.aborted) {
        return;
      }
      if (result.ok) {
        setBenchmark(result.benchmark);
        setBenchmarkMissing(false);
        setBenchmarkError(null);
      } else if (result.missing) {
        setBenchmark(null);
        setBenchmarkMissing(true);
        setBenchmarkError(null);
      } else {
        setBenchmarkError(result.error);
      }
      setBenchmarkLoading(false);
    });
    return () => {
      controller.abort();
    };
  }, [apiUrl]);

  async function refresh() {
    setRefreshing(true);
    const result = await requestMetrics(apiUrl);
    if (result.ok) {
      setMetrics(result.metrics);
      setMetricsError(null);
    } else {
      setMetricsError(result.error);
    }
    setRefreshing(false);
  }

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader
        current="dashboard"
        wide
        description="Live traffic from this API process, and the latest offline benchmark."
      />
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-10 px-6 py-6">
        <RuntimeMetrics
          metrics={metrics}
          loading={metricsLoading}
          error={metricsError}
          refreshing={refreshing}
          onRefresh={() => void refresh()}
        />
        <BenchmarkMetrics benchmark={benchmark} loading={benchmarkLoading} missing={benchmarkMissing} error={benchmarkError} />
      </main>
    </div>
  );
}

function RuntimeMetrics({
  metrics,
  loading,
  error,
  refreshing,
  onRefresh,
}: {
  metrics: MetricsSnapshot | null;
  loading: boolean;
  error: string | null;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const refreshButton = (
    <button
      type="button"
      onClick={onRefresh}
      disabled={loading || refreshing}
      className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:bg-neutral-300"
    >
      {refreshing ? "Refreshing…" : "Refresh"}
    </button>
  );

  return (
    <div className="flex flex-col gap-8">
      <Section
        eyebrow="Live"
        title="Runtime metrics"
        description="Counts from requests handled by the running API. They reset when that process restarts."
        action={refreshButton}
      >
        {loading ? <Status>Loading runtime metrics…</Status> : null}
        {error ? <Alert>{error}</Alert> : null}
        {!loading && !error && metrics?.totalRequests === 0 ? (
          <Status>No requests have been recorded in this API process.</Status>
        ) : null}
        {metrics && metrics.totalRequests > 0 ? <RuntimeFigures metrics={metrics} /> : null}
      </Section>
    </div>
  );
}

function RuntimeFigures({ metrics }: { metrics: MetricsSnapshot }) {
  return (
    <div className="flex flex-col gap-8">
      <CardGrid>
        <MetricCard label="Total requests" value={formatCount(metrics.totalRequests)} />
        <MetricCard label="Cache hits" value={formatCount(metrics.cacheHits)} />
        <MetricCard label="Cache misses" value={formatCount(metrics.cacheMisses)} />
        <MetricCard label="Cache hit rate" value={formatPercent(metrics.hitRate)} />
        <MetricCard label="LLM calls" value={formatCount(metrics.llmCalls)} />
        <MetricCard label="LLM calls avoided" value={formatCount(metrics.llmCallsAvoided)} detail="One avoided call for each cache hit." />
      </CardGrid>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Panel title="Hits and misses">
          <BarChart
            empty="No requests have been recorded."
            bars={[
              { label: "HIT", value: metrics.cacheHits, display: formatCount(metrics.cacheHits) },
              { label: "MISS", value: metrics.cacheMisses, display: formatCount(metrics.cacheMisses) },
            ]}
          />
        </Panel>
        <Panel title="Latency">
          <BarChart
            empty="No latency has been recorded."
            bars={[
              { label: "HIT", value: metrics.averageLatencyMs.hit, display: formatMs(metrics.averageLatencyMs.hit) },
              { label: "MISS", value: metrics.averageLatencyMs.miss, display: formatMs(metrics.averageLatencyMs.miss) },
              { label: "Embedding", value: metrics.averageLatencyMs.embedding, display: formatMs(metrics.averageLatencyMs.embedding) },
              { label: "Redis", value: metrics.averageLatencyMs.redis, display: formatMs(metrics.averageLatencyMs.redis) },
              { label: "LLM", value: metrics.averageLatencyMs.llm, display: formatMs(metrics.averageLatencyMs.llm) },
            ]}
          />
        </Panel>
      </div>

      <Section eyebrow="Live" title="Performance" description="Average request time for hits and misses. Embedding time includes only requests that ran the local model. LLM time includes only requests that called the model.">
        <CardGrid>
          <MetricCard label="Average HIT latency" value={metrics.cacheHits === 0 ? "—" : formatMs(metrics.averageLatencyMs.hit)} />
          <MetricCard label="Average MISS latency" value={metrics.cacheMisses === 0 ? "—" : formatMs(metrics.averageLatencyMs.miss)} />
          <MetricCard label="Embedding latency" value={formatMs(metrics.averageLatencyMs.embedding)} />
          <MetricCard label="Redis latency" value={formatMs(metrics.averageLatencyMs.redis)} />
          <MetricCard label="LLM latency" value={metrics.llmCalls === 0 ? "—" : formatMs(metrics.averageLatencyMs.llm)} />
        </CardGrid>
      </Section>

      <Section eyebrow="Live" title="Cost" description="Estimates from the recorded token counts and local CPU time. Savings use the average measured LLM request cost.">
        <CardGrid>
          <MetricCard
            label="Estimated cache-hit cost"
            value={metrics.cacheHits === 0 ? "—" : formatUsd(metrics.cost.averageCacheHitUsd)}
            detail="Average of recorded hits."
          />
          <MetricCard
            label="Estimated LLM request cost"
            value={metrics.llmCalls === 0 ? "—" : formatUsd(metrics.cost.averageLlmRequestUsd)}
            detail="Average of recorded LLM calls."
          />
          <MetricCard label="LLM / cache cost ratio" value={formatRatio(metrics.cost.ratio)} />
          <MetricCard
            label="Estimated savings"
            value={formatUsd(metrics.cost.savingsUsd)}
            detail={metrics.cost.savingsUsd === null ? "Needs a measured LLM call." : "Avoided calls priced at the average LLM request."}
          />
        </CardGrid>
      </Section>

      <Section eyebrow="Live" title="Cache breakdown" description="Exact hits skip the embedding model. Semantic hits reuse a similar question. Miss reasons come from the decision already made for that request.">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <Panel title="How answers were served">
            <BarChart
              empty="No cache decisions have been recorded."
              bars={[
                { label: "Exact HIT", value: metrics.exactHits, display: formatCount(metrics.exactHits) },
                { label: "Semantic HIT", value: metrics.semanticHits, display: formatCount(metrics.semanticHits) },
                { label: "MISS", value: metrics.cacheMisses, display: formatCount(metrics.cacheMisses) },
              ]}
            />
          </Panel>
          <Panel title="Semantic miss reasons">
            <BarChart
              empty={metrics.cacheMisses === 0 ? "No misses have been recorded." : "Miss reasons were not recorded."}
              bars={metrics.missReasons.map((item) => ({
                label: missLabel(item),
                value: item.count,
                display: formatCount(item.count),
              }))}
            />
          </Panel>
        </div>
      </Section>
    </div>
  );
}

function BenchmarkMetrics({
  benchmark,
  loading,
  missing,
  error,
}: {
  benchmark: BenchmarkDashboard | null;
  loading: boolean;
  missing: boolean;
  error: string | null;
}) {
  return (
    <Section
      eyebrow="Offline benchmark"
      title="Evaluation"
      description="The latest saved report from the labeled dataset. This is not live traffic, and it does not change the production threshold."
    >
      {loading ? <Status>Loading the benchmark report…</Status> : null}
      {error ? <Alert>{error}</Alert> : null}
      {missing ? <Status>No benchmark report has been saved yet.</Status> : null}
      {benchmark ? <BenchmarkFigures benchmark={benchmark} /> : null}
    </Section>
  );
}

function BenchmarkFigures({ benchmark }: { benchmark: BenchmarkDashboard }) {
  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-3xl text-sm text-neutral-500">
        {benchmark.cases} cases · {benchmark.embeddingModel} · generated {benchmark.generatedAt} · production threshold{" "}
        {benchmark.productionThreshold.toFixed(2)}
        {benchmark.productionThresholdChanged ? " · this report changed the production threshold" : " · this report did not change the production threshold"}
      </p>
      <CardGrid>
        <MetricCard label="Hit rate" value={formatPercent(benchmark.hitRate)} />
        <MetricCard label="Correct hit rate" value={formatPercent(benchmark.correctHitRate)} />
        <MetricCard label="False hits" value={formatCount(benchmark.falseHits)} />
        <MetricCard label="False misses" value={formatCount(benchmark.falseMisses)} />
        <MetricCard label="Cost ratio" value={formatRatio(benchmark.costRatio)} detail="LLM request cost / cache-hit cost." />
        <MetricCard label="Benchmark cache-hit cost" value={formatUsd(benchmark.averageCacheHitUsd)} />
        <MetricCard label="Benchmark LLM request cost" value={formatUsd(benchmark.averageLlmRequestUsd)} />
      </CardGrid>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Panel title="Threshold and hit rate">
          <BarChart
            max={1}
            empty="The report has no threshold rows."
            bars={benchmark.thresholds.map((row) => ({
              label: row.threshold === benchmark.productionThreshold ? `${row.threshold.toFixed(2)} production` : row.threshold.toFixed(2),
              value: row.hitRate,
              display: formatPercent(row.hitRate),
            }))}
          />
        </Panel>
        <Panel title="Hit rate by category">
          <BarChart
            max={1}
            empty="The report has no category rows."
            bars={benchmark.categories.map((row) => ({
              label: formatCategory(row.category),
              value: row.hitRate,
              display: formatPercent(row.hitRate),
            }))}
          />
        </Panel>
      </div>
      <div className="overflow-x-auto rounded-md border border-neutral-200">
        <table className="w-full min-w-[36rem] text-left text-sm">
          <thead className="border-b border-neutral-200 text-neutral-600">
            <tr>
              <th className="px-3 py-2 font-medium">Category</th>
              <th className="px-3 py-2 font-medium">Cases</th>
              <th className="px-3 py-2 font-medium">Hit rate</th>
              <th className="px-3 py-2 font-medium">False hits</th>
              <th className="px-3 py-2 font-medium">False misses</th>
            </tr>
          </thead>
          <tbody>
            {benchmark.categories.map((row) => (
              <tr key={row.category} className="border-b border-neutral-100 last:border-0">
                <td className="px-3 py-2">{formatCategory(row.category)}</td>
                <td className="px-3 py-2">{formatCount(row.cases)}</td>
                <td className="px-3 py-2">{formatPercent(row.hitRate)}</td>
                <td className="px-3 py-2">{formatCount(row.falseHits)}</td>
                <td className="px-3 py-2">{formatCount(row.falseMisses)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Status({ children }: { children: string }) {
  return (
    <p className="text-sm text-neutral-500" role="status">
      {children}
    </p>
  );
}

function Alert({ children }: { children: string }) {
  return (
    <p className="text-sm text-red-700" role="alert">
      {children}
    </p>
  );
}

function missLabel(item: MissReasonCount): string {
  if (item.reason === "guard" && item.guard) {
    return `${item.guard} guard`;
  }
  if (item.reason === "no-candidate") {
    return "No similar question";
  }
  if (item.reason === "below-threshold") {
    return "Below threshold";
  }
  if (item.reason === "metadata") {
    return "Metadata mismatch";
  }
  if (item.reason === "stale") {
    return "Expired";
  }
  if (item.reason === "unavailable") {
    return "Lookup failed";
  }
  if (item.reason === "time-sensitive") {
    return "Time-sensitive";
  }
  return item.reason;
}

function trimSlash(url: string): string {
  return url.replace(/\/$/, "");
}

async function requestMetrics(
  apiUrl: string,
  signal?: AbortSignal,
): Promise<{ ok: true; metrics: MetricsSnapshot } | { ok: false; error: string }> {
  try {
    const response = await fetch(`${trimSlash(apiUrl)}/api/metrics`, { signal });
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok || !isMetrics(body)) {
      return { ok: false, error: readError(body) ?? "The metrics request failed." };
    }
    return { ok: true, metrics: body };
  } catch {
    return { ok: false, error: "The metrics request failed." };
  }
}

async function requestBenchmark(
  apiUrl: string,
  signal?: AbortSignal,
): Promise<
  | { ok: true; benchmark: BenchmarkDashboard }
  | { ok: false; missing: true }
  | { ok: false; missing: false; error: string }
> {
  try {
    const response = await fetch(`${trimSlash(apiUrl)}/api/benchmark`, { signal });
    const body: unknown = await response.json().catch(() => null);
    if (response.status === 404) {
      return { ok: false, missing: true };
    }
    if (!response.ok || !isBenchmark(body)) {
      return { ok: false, missing: false, error: readError(body) ?? "The benchmark request failed." };
    }
    return { ok: true, benchmark: body };
  } catch {
    return { ok: false, missing: false, error: "The benchmark request failed." };
  }
}

function readError(body: unknown): string | undefined {
  if (typeof body !== "object" || body === null || !("error" in body)) {
    return undefined;
  }
  const error = body.error;
  return typeof error === "string" && error.trim().length > 0 ? error : undefined;
}

function isMetrics(body: unknown): body is MetricsSnapshot {
  if (!isRecord(body) || !isRecord(body.averageLatencyMs) || !isRecord(body.cost) || !Array.isArray(body.missReasons)) {
    return false;
  }
  return (
    isNumber(body.totalRequests) &&
    isNumber(body.cacheHits) &&
    isNumber(body.cacheMisses) &&
    isNumber(body.exactHits) &&
    isNumber(body.semanticHits) &&
    isNumber(body.hitRate) &&
    isNumber(body.llmCalls) &&
    isNumber(body.llmCallsAvoided) &&
    isNumber(body.averageLatencyMs.hit) &&
    isNumber(body.averageLatencyMs.miss) &&
    isNumber(body.averageLatencyMs.embedding) &&
    isNumber(body.averageLatencyMs.redis) &&
    isNumber(body.averageLatencyMs.llm) &&
    isNumber(body.cost.averageCacheHitUsd) &&
    isNumber(body.cost.averageLlmRequestUsd) &&
    isNullableNumber(body.cost.savingsUsd) &&
    isNullableNumber(body.cost.ratio) &&
    body.missReasons.every(isMissReason)
  );
}

function isBenchmark(body: unknown): body is BenchmarkDashboard {
  if (!isRecord(body) || !Array.isArray(body.categories) || !Array.isArray(body.thresholds)) {
    return false;
  }
  return (
    typeof body.generatedAt === "string" &&
    isNumber(body.cases) &&
    typeof body.embeddingModel === "string" &&
    isNumber(body.productionThreshold) &&
    typeof body.productionThresholdChanged === "boolean" &&
    isNumber(body.hitRate) &&
    isNumber(body.correctHitRate) &&
    isNumber(body.falseHits) &&
    isNumber(body.falseMisses) &&
    isNullableNumber(body.costRatio) &&
    isNumber(body.averageCacheHitUsd) &&
    isNumber(body.averageLlmRequestUsd) &&
    body.categories.every(isCategory) &&
    body.thresholds.every(isThreshold)
  );
}

function isMissReason(value: unknown): value is MissReasonCount {
  return isRecord(value) && typeof value.reason === "string" && isNumber(value.count) && (value.guard === undefined || typeof value.guard === "string");
}

function isCategory(value: unknown): value is BenchmarkCategory {
  return (
    isRecord(value) &&
    typeof value.category === "string" &&
    isNumber(value.cases) &&
    isNumber(value.hitRate) &&
    isNumber(value.falseHits) &&
    isNumber(value.falseMisses)
  );
}

function isThreshold(value: unknown): value is BenchmarkThreshold {
  return (
    isRecord(value) &&
    isNumber(value.threshold) &&
    isNumber(value.hitRate) &&
    isNumber(value.correctHitRate) &&
    isNumber(value.falseHits) &&
    isNumber(value.falseMisses)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isNullableNumber(value: unknown): value is number | null {
  return value === null || isNumber(value);
}
