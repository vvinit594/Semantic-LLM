/** Benchmark runner. The full `pnpm evaluate` report starts in Phase 15. */
export const EVALUATION_PACKAGE = "@semantic-llm/evaluation";
export { CANDIDATE_THRESHOLDS, HIT_RATE_PROBES } from "./probes";
export type { HitRateProbe, ProbeExpectation, ProbeKind } from "./probes";
export { observePair, summarize, summarizeThresholds, wouldReuse } from "./report";
export type { ProbeObservation, ThresholdRow } from "./report";
