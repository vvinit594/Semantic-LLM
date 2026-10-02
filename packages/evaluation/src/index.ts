/** Benchmark runner. The full `pnpm evaluate` report starts in Phase 15. */
export const EVALUATION_PACKAGE = "@semantic-llm/evaluation";
export { CANDIDATE_THRESHOLDS, HIT_RATE_PROBES } from "./probes";
export type { HitRateProbe, ProbeExpectation, ProbeKind } from "./probes";
export {
  DEFAULT_COST_RATES,
  GEMINI_38_FLASH_INPUT_USD_PER_MILLION,
  GEMINI_38_FLASH_OUTPUT_USD_PER_MILLION,
  LOCAL_COMPUTE_USD_PER_HOUR,
  LOCAL_COMPUTE_USD_PER_SECOND,
  costRatio,
  quoteCosts,
} from "./cost";
export type { CostQuote, CostRates, CostSample } from "./cost";
export { observePair, summarize, summarizeThresholds, wouldReuse } from "./report";
export type { ProbeObservation, ThresholdRow } from "./report";
