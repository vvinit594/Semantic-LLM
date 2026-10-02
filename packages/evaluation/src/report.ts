import { isTimeSensitive, safetyGuard, type SafetyGuard } from "@semantic-llm/decision";
import { normalizeQuery } from "@semantic-llm/query";
import { CANDIDATE_THRESHOLDS, type HitRateProbe } from "./probes";

export type ProbeObservation = {
  probe: HitRateProbe;
  score: number;
  normalizedEqual: boolean;
  timeBypass: boolean;
  guard: SafetyGuard | undefined;
};

export type ThresholdRow = {
  threshold: number;
  hits: number;
  misses: number;
  hitRate: number;
  correctHitRate: number;
  falseHitRate: number;
  falseMissRate: number;
  missRate: number;
};

export function observePair(probe: HitRateProbe, score: number): ProbeObservation {
  return {
    probe,
    score,
    normalizedEqual: normalizeQuery(probe.anchor) === normalizeQuery(probe.query),
    timeBypass: isTimeSensitive(probe.anchor) || isTimeSensitive(probe.query),
    guard: safetyGuard(probe.anchor, probe.query),
  };
}

/** Mirrors the chat path: time bypass, then exact normalized match, then guards, then threshold. */
export function wouldReuse(observation: ProbeObservation, threshold: number): boolean {
  if (observation.timeBypass) {
    return false;
  }
  if (observation.normalizedEqual) {
    return true;
  }
  if (observation.guard) {
    return false;
  }
  return observation.score >= threshold;
}

export function summarize(observations: readonly ProbeObservation[], threshold: number): ThresholdRow {
  let hits = 0;
  let expectedHits = 0;
  let expectedMisses = 0;
  let correctHits = 0;
  let falseHits = 0;
  let falseMisses = 0;

  for (const observation of observations) {
    const hit = wouldReuse(observation, threshold);
    if (hit) {
      hits += 1;
    }
    if (observation.probe.expect === "hit") {
      expectedHits += 1;
      if (hit) {
        correctHits += 1;
      } else {
        falseMisses += 1;
      }
    } else {
      expectedMisses += 1;
      if (hit) {
        falseHits += 1;
      }
    }
  }

  const total = observations.length;
  return {
    threshold,
    hits,
    misses: total - hits,
    hitRate: ratio(hits, total),
    correctHitRate: ratio(correctHits, expectedHits),
    falseHitRate: ratio(falseHits, expectedMisses),
    falseMissRate: ratio(falseMisses, expectedHits),
    missRate: ratio(total - hits, total),
  };
}

export function summarizeThresholds(observations: readonly ProbeObservation[]): ThresholdRow[] {
  return CANDIDATE_THRESHOLDS.map((threshold) => summarize(observations, threshold));
}

function ratio(part: number, total: number): number {
  return total === 0 ? 0 : part / total;
}
