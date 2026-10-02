/**
 * Gemini 3.8 Flash introductory list price through 2026-12-31.
 * https://ai.google.dev/gemini-api/docs/pricing
 */
export const GEMINI_38_FLASH_INPUT_USD_PER_MILLION = 0.75;
export const GEMINI_38_FLASH_OUTPUT_USD_PER_MILLION = 3.75;

/**
 * Planning rate for one local vCPU-hour. Local MiniLM has no embedding API fee.
 * This rate prices measured CPU time only.
 */
export const LOCAL_COMPUTE_USD_PER_HOUR = 0.05;
export const LOCAL_COMPUTE_USD_PER_SECOND = LOCAL_COMPUTE_USD_PER_HOUR / 3600;

export type CostRates = {
  /** Paid embedding API price per call. Local MiniLM stays at 0. */
  embeddingApiUsdPerCall: number;
  computeUsdPerSecond: number;
  llmInputUsdPerMillionTokens: number;
  llmOutputUsdPerMillionTokens: number;
};

export type CostSample = {
  embeddingMs: number;
  redisMs: number;
  llmMs: number;
  embeddingCalls: number;
  llmInputTokens: number;
  llmOutputTokens: number;
};

export type CostQuote = {
  embeddingUsd: number;
  redisUsd: number;
  llmInputUsd: number;
  llmOutputUsd: number;
  llmComputeUsd: number;
  cacheHitUsd: number;
  llmRequestUsd: number;
};

export const DEFAULT_COST_RATES: CostRates = {
  embeddingApiUsdPerCall: 0,
  computeUsdPerSecond: LOCAL_COMPUTE_USD_PER_SECOND,
  llmInputUsdPerMillionTokens: GEMINI_38_FLASH_INPUT_USD_PER_MILLION,
  llmOutputUsdPerMillionTokens: GEMINI_38_FLASH_OUTPUT_USD_PER_MILLION,
};

export function quoteCosts(sample: CostSample, rates: CostRates = DEFAULT_COST_RATES): CostQuote {
  const embeddingUsd =
    sample.embeddingCalls * rates.embeddingApiUsdPerCall +
    seconds(sample.embeddingMs) * rates.computeUsdPerSecond;
  const redisUsd = seconds(sample.redisMs) * rates.computeUsdPerSecond;
  const llmInputUsd = (sample.llmInputTokens / 1_000_000) * rates.llmInputUsdPerMillionTokens;
  const llmOutputUsd = (sample.llmOutputTokens / 1_000_000) * rates.llmOutputUsdPerMillionTokens;
  const llmComputeUsd = seconds(sample.llmMs) * rates.computeUsdPerSecond;
  return {
    embeddingUsd,
    redisUsd,
    llmInputUsd,
    llmOutputUsd,
    llmComputeUsd,
    cacheHitUsd: embeddingUsd + redisUsd,
    /** Token invoice only. API wait is llmComputeUsd and is not part of this bill. */
    llmRequestUsd: llmInputUsd + llmOutputUsd,
  };
}

/** LLM request cost divided by cache HIT cost. Null when the hit cost is not a positive number. */
export function costRatio(cacheHitUsd: number, llmRequestUsd: number): number | null {
  if (!(cacheHitUsd > 0) || !Number.isFinite(llmRequestUsd)) {
    return null;
  }
  return llmRequestUsd / cacheHitUsd;
}

function seconds(milliseconds: number): number {
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) {
    return 0;
  }
  return milliseconds / 1000;
}
