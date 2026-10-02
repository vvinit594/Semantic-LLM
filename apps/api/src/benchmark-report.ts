import { readFile } from "node:fs/promises";

export class BenchmarkReportMissingError extends Error {
  constructor() {
    super("No benchmark report is available.");
    this.name = "BenchmarkReportMissingError";
  }
}

export class BenchmarkReportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BenchmarkReportError";
  }
}

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

export async function loadBenchmarkReport(path: string): Promise<BenchmarkDashboard> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (error) {
    if (isMissingFile(error)) {
      throw new BenchmarkReportMissingError();
    }
    throw new BenchmarkReportError("The benchmark report could not be read.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new BenchmarkReportError("The benchmark report is not valid JSON.");
  }
  return parseBenchmarkReport(parsed);
}

export function parseBenchmarkReport(value: unknown): BenchmarkDashboard {
  if (!isRecord(value)) {
    throw new BenchmarkReportError("The benchmark report has an unexpected shape.");
  }
  const production = value.production;
  const cost = value.cost;
  if (!isRecord(production) || !isRecord(cost)) {
    throw new BenchmarkReportError("The benchmark report has an unexpected shape.");
  }
  const generatedAt = readString(value.generatedAt);
  const embeddingModel = readString(value.embeddingModel);
  const productionThreshold = readNumber(value.productionThreshold);
  const cases = readNumber(value.cases);
  const changed = value.productionThresholdChanged;
  const hitRate = readNumber(production.hitRate);
  const correctHitRate = readNumber(production.correctHitRate);
  const falseHits = readNumber(production.falseHits);
  const falseMisses = readNumber(production.falseMisses);
  const averageCacheHitUsd = readNumber(cost.averageCacheHitUsd);
  const averageLlmRequestUsd = readNumber(cost.averageLlmRequestUsd);
  const costRatio = readNullableNumber(cost.ratio);
  const categories = readCategories(production.categories);
  const thresholds = readThresholds(value.thresholds);
  if (
    generatedAt === undefined ||
    embeddingModel === undefined ||
    productionThreshold === undefined ||
    cases === undefined ||
    typeof changed !== "boolean" ||
    hitRate === undefined ||
    correctHitRate === undefined ||
    falseHits === undefined ||
    falseMisses === undefined ||
    averageCacheHitUsd === undefined ||
    averageLlmRequestUsd === undefined ||
    costRatio === undefined ||
    categories === undefined ||
    thresholds === undefined
  ) {
    throw new BenchmarkReportError("The benchmark report is missing a required field.");
  }
  return {
    generatedAt,
    cases,
    embeddingModel,
    productionThreshold,
    productionThresholdChanged: changed,
    hitRate,
    correctHitRate,
    falseHits,
    falseMisses,
    categories,
    thresholds,
    costRatio,
    averageCacheHitUsd,
    averageLlmRequestUsd,
  };
}

function readCategories(value: unknown): BenchmarkCategory[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const categories: BenchmarkCategory[] = [];
  for (const item of value) {
    if (!isRecord(item)) {
      return undefined;
    }
    const category = readString(item.category);
    const cases = readNumber(item.cases);
    const hitRate = readNumber(item.hitRate);
    const falseHits = readNumber(item.falseHits);
    const falseMisses = readNumber(item.falseMisses);
    if (
      category === undefined ||
      cases === undefined ||
      hitRate === undefined ||
      falseHits === undefined ||
      falseMisses === undefined
    ) {
      return undefined;
    }
    categories.push({ category, cases, hitRate, falseHits, falseMisses });
  }
  return categories;
}

function readThresholds(value: unknown): BenchmarkThreshold[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const thresholds: BenchmarkThreshold[] = [];
  for (const item of value) {
    if (!isRecord(item)) {
      return undefined;
    }
    const threshold = readNumber(item.threshold);
    const hitRate = readNumber(item.hitRate);
    const correctHitRate = readNumber(item.correctHitRate);
    const falseHits = readNumber(item.falseHits);
    const falseMisses = readNumber(item.falseMisses);
    if (
      threshold === undefined ||
      hitRate === undefined ||
      correctHitRate === undefined ||
      falseHits === undefined ||
      falseMisses === undefined
    ) {
      return undefined;
    }
    thresholds.push({ threshold, hitRate, correctHitRate, falseHits, falseMisses });
  }
  return thresholds;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readNullableNumber(value: unknown): number | null | undefined {
  if (value === null) {
    return null;
  }
  return readNumber(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMissingFile(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
