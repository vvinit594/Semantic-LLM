export type ChatReply = {
  answer: string;
  cached: boolean;
  match: "exact" | "semantic" | null;
  similarity: number | null;
  matchedQuery: string | null;
};

export type MissReasonCount = {
  reason: string;
  guard?: string;
  count: number;
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

export type BenchmarkCategory = {
  category: string;
  cases: number;
  hitRate: number;
  falseHits: number;
  falseMisses: number;
};

export type BenchmarkThreshold = {
  threshold: number;
  hitRate: number;
  correctHitRate: number;
  falseHits: number;
  falseMisses: number;
};

export type BenchmarkDashboard = {
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

export type CacheEntry = {
  id: string;
  type: "exact" | "semantic";
  query: string;
  answer: string;
  answerTruncated: boolean;
  model: string | null;
  language: string | null;
  scope: string | null;
  createdAt: string | null;
  expiresAt: string | null;
  metadata: Record<string, string>;
};

export type CachePage = {
  entries: CacheEntry[];
  total: number;
  truncated: boolean;
};

export function readApiError(body: unknown): string | undefined {
  if (typeof body !== "object" || body === null || !("error" in body)) {
    return undefined;
  }
  const error = body.error;
  return typeof error === "string" && error.trim().length > 0 ? error : undefined;
}

export function chatResult(ok: boolean, body: unknown): { ok: true; reply: ChatReply } | { ok: false; error: string } {
  if (!ok) {
    return { ok: false, error: readApiError(body) ?? "The request failed." };
  }
  if (!isChatReply(body)) {
    return { ok: false, error: "The API returned an unexpected response." };
  }
  return { ok: true, reply: body };
}

export function metricsResult(ok: boolean, body: unknown): { ok: true; metrics: MetricsSnapshot } | { ok: false; error: string } {
  if (!ok || !isMetricsSnapshot(body)) {
    return { ok: false, error: readApiError(body) ?? "The metrics request failed." };
  }
  return { ok: true, metrics: body };
}

export function benchmarkResult(
  status: number,
  body: unknown,
): { ok: true; benchmark: BenchmarkDashboard } | { ok: false; missing: true } | { ok: false; missing: false; error: string } {
  if (status === 404) {
    return { ok: false, missing: true };
  }
  if (status < 200 || status >= 300 || !isBenchmarkReport(body)) {
    return { ok: false, missing: false, error: readApiError(body) ?? "The benchmark request failed." };
  }
  return { ok: true, benchmark: body };
}

export function cacheResult(ok: boolean, body: unknown): { ok: true; page: CachePage } | { ok: false; error: string } {
  if (!ok || !isCachePage(body)) {
    return { ok: false, error: readApiError(body) ?? "The cache request failed." };
  }
  return { ok: true, page: body };
}

function isChatReply(body: unknown): body is ChatReply {
  if (typeof body !== "object" || body === null) {
    return false;
  }
  const reply = body as Partial<ChatReply>;
  return (
    typeof reply.answer === "string" &&
    typeof reply.cached === "boolean" &&
    (reply.match === "exact" || reply.match === "semantic" || reply.match === null) &&
    (typeof reply.similarity === "number" || reply.similarity === null) &&
    (typeof reply.matchedQuery === "string" || reply.matchedQuery === null)
  );
}

function isMetricsSnapshot(body: unknown): body is MetricsSnapshot {
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

function isBenchmarkReport(body: unknown): body is BenchmarkDashboard {
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

function isCachePage(value: unknown): value is CachePage {
  if (typeof value !== "object" || value === null || !("entries" in value)) {
    return false;
  }
  const page = value as Partial<CachePage>;
  return Array.isArray(page.entries) && page.entries.every(isCacheEntry) && typeof page.total === "number" && typeof page.truncated === "boolean";
}

function isCacheEntry(value: unknown): value is CacheEntry {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const entry = value as Partial<CacheEntry>;
  return (
    typeof entry.id === "string" &&
    (entry.type === "exact" || entry.type === "semantic") &&
    typeof entry.query === "string" &&
    typeof entry.answer === "string" &&
    typeof entry.answerTruncated === "boolean" &&
    (typeof entry.model === "string" || entry.model === null) &&
    (typeof entry.language === "string" || entry.language === null) &&
    (typeof entry.scope === "string" || entry.scope === null) &&
    (typeof entry.createdAt === "string" || entry.createdAt === null) &&
    (typeof entry.expiresAt === "string" || entry.expiresAt === null) &&
    isStringRecord(entry.metadata)
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

function isStringRecord(value: unknown): value is Record<string, string> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  return Object.values(value).every((item) => typeof item === "string");
}
