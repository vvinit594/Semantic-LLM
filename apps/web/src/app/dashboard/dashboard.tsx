"use client";

import { useEffect, useState } from "react";
import { benchmarkResult, metricsResult, type BenchmarkDashboard, type MetricsSnapshot, type MissReasonCount } from "../../api-responses";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingSkeleton } from "@/components/ui/loading-skeleton";
import { CardGrid, MetricCard } from "@/components/ui/metric-card";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { BarChart } from "./charts";
import { formatCategory, formatCount, formatMs, formatPercent, formatRatio, formatUsd } from "./format";

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
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-10 px-4 py-8 sm:px-6">
      <PageHeader
        title="Analytics"
        subtitle="Live traffic from this API process, and the latest offline benchmark."
      />
        <RuntimeMetrics
          metrics={metrics}
          loading={metricsLoading}
          error={metricsError}
          refreshing={refreshing}
          onRefresh={() => void refresh()}
        />
        <BenchmarkMetrics benchmark={benchmark} loading={benchmarkLoading} missing={benchmarkMissing} error={benchmarkError} />
    </main>
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
    <Button type="button" onClick={onRefresh} disabled={loading || refreshing}>
      {refreshing ? "Refreshing…" : "Refresh"}
    </Button>
  );

  return (
    <div className="flex flex-col gap-8">
      <Section
        eyebrow="Live"
        title="Runtime metrics"
        description="Counts from requests handled by the running API. They reset when that process restarts."
        action={refreshButton}
      >
        {loading ? <LoadingSkeleton label="Loading runtime metrics…" /> : null}
        {error ? <ErrorState>{error}</ErrorState> : null}
        {!loading && !error && metrics?.totalRequests === 0 ? (
          <EmptyState title="No requests yet" detail="Counts appear after this API process handles a chat request. They reset when that process restarts." />
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
        <Card title="Hits and misses">
          <BarChart
            empty="No requests have been recorded."
            bars={[
              { label: "HIT", value: metrics.cacheHits, display: formatCount(metrics.cacheHits) },
              { label: "MISS", value: metrics.cacheMisses, display: formatCount(metrics.cacheMisses) },
            ]}
          />
        </Card>
        <Card title="Latency">
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
        </Card>
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
          <Card title="How answers were served">
            <BarChart
              empty="No cache decisions have been recorded."
              bars={[
                { label: "Exact HIT", value: metrics.exactHits, display: formatCount(metrics.exactHits) },
                { label: "Semantic HIT", value: metrics.semanticHits, display: formatCount(metrics.semanticHits) },
                { label: "MISS", value: metrics.cacheMisses, display: formatCount(metrics.cacheMisses) },
              ]}
            />
          </Card>
          <Card title="Semantic miss reasons">
            <BarChart
              empty={metrics.cacheMisses === 0 ? "No misses have been recorded." : "Miss reasons were not recorded."}
              bars={metrics.missReasons.map((item) => ({
                label: missLabel(item),
                value: item.count,
                display: formatCount(item.count),
              }))}
            />
          </Card>
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
      {loading ? <LoadingSkeleton label="Loading the benchmark report…" /> : null}
      {error ? <ErrorState>{error}</ErrorState> : null}
      {missing ? <EmptyState title="No benchmark report" detail="The saved evaluation report has not been written yet." /> : null}
      {benchmark ? <BenchmarkFigures benchmark={benchmark} /> : null}
    </Section>
  );
}

function BenchmarkFigures({ benchmark }: { benchmark: BenchmarkDashboard }) {
  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-3xl text-xs leading-5 text-faint">
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
        <Card title="Threshold and hit rate">
          <BarChart
            max={1}
            empty="The report has no threshold rows."
            bars={benchmark.thresholds.map((row) => ({
              label: row.threshold === benchmark.productionThreshold ? `${row.threshold.toFixed(2)} production` : row.threshold.toFixed(2),
              value: row.hitRate,
              display: formatPercent(row.hitRate),
            }))}
          />
        </Card>
        <Card title="Hit rate by category">
          <BarChart
            max={1}
            empty="The report has no category rows."
            bars={benchmark.categories.map((row) => ({
              label: formatCategory(row.category),
              value: row.hitRate,
              display: formatPercent(row.hitRate),
            }))}
          />
        </Card>
      </div>
      <div className="overflow-x-auto rounded-card border border-line">
        <table className="w-full min-w-[36rem] text-left text-sm">
          <thead className="border-b border-line text-secondary">
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
              <tr key={row.category} className="border-b border-line last:border-0">
                <td className="px-3 py-2 text-ink">{formatCategory(row.category)}</td>
                <td className="px-3 py-2 text-secondary">{formatCount(row.cases)}</td>
                <td className="px-3 py-2 text-secondary">{formatPercent(row.hitRate)}</td>
                <td className="px-3 py-2 text-secondary">{formatCount(row.falseHits)}</td>
                <td className="px-3 py-2 text-secondary">{formatCount(row.falseMisses)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
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
    return metricsResult(response.ok, body);
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
    return benchmarkResult(response.status, body);
  } catch {
    return { ok: false, missing: false, error: "The benchmark request failed." };
  }
}

