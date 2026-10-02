import { metadataGuard, safetyGuard, type SafetyGuard } from "./guards";

export type DecisionContext = {
  query: string;
  model: string;
  language: string;
  scope: string;
  threshold: number;
  now: Date;
};

export type DecisionCandidate = {
  id: string;
  query: string;
  score: number;
  response: string;
  model: string;
  language: string;
  scope: string;
  expiresAt: string;
};

export type DecisionMissReason = "no-candidate" | "below-threshold" | "metadata" | "stale" | "guard";

export type CacheDecision =
  | { decision: "hit"; id: string; response: string; score: number }
  | { decision: "miss"; reason: "guard"; guard: SafetyGuard }
  | { decision: "miss"; reason: Exclude<DecisionMissReason, "guard"> };

export class DecisionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DecisionError";
  }
}

/**
 * Choose HIT or MISS from similarity, metadata, freshness, and safety guards.
 */
export function decideCache(
  context: DecisionContext,
  candidates: readonly DecisionCandidate[],
): CacheDecision {
  if (!Number.isFinite(context.threshold) || context.threshold <= 0 || context.threshold > 1) {
    throw new DecisionError("threshold must be greater than 0 and at most 1");
  }
  if (Number.isNaN(context.now.getTime())) {
    throw new DecisionError("now must be a valid date");
  }
  if (candidates.length === 0) {
    return { decision: "miss", reason: "no-candidate" };
  }

  const ranked = [...candidates].sort((left, right) => rankScore(right.score) - rankScore(left.score));
  let reason: Exclude<DecisionMissReason, "guard"> | "guard" = "below-threshold";
  let guard: SafetyGuard | undefined;
  for (const candidate of ranked) {
    if (!Number.isFinite(candidate.score) || candidate.score < context.threshold) {
      break;
    }
    if (metadataGuard({
      model: context.model,
      candidateModel: candidate.model,
      language: context.language,
      candidateLanguage: candidate.language,
      scope: context.scope,
      candidateScope: candidate.scope,
    })) {
      if (reason === "below-threshold") {
        reason = "metadata";
      }
      continue;
    }
    if (!isFresh(candidate, context.now)) {
      if (reason === "below-threshold") {
        reason = "stale";
      }
      continue;
    }
    const rejected = safetyGuard(context.query, candidate.query);
    if (rejected) {
      if (reason === "below-threshold") {
        reason = "guard";
        guard = rejected;
      }
      continue;
    }
    return {
      decision: "hit",
      id: candidate.id,
      response: candidate.response,
      score: candidate.score,
    };
  }
  if (reason === "guard" && guard) {
    return { decision: "miss", reason, guard };
  }
  if (reason === "guard") {
    return { decision: "miss", reason: "below-threshold" };
  }
  return { decision: "miss", reason };
}

function rankScore(score: number): number {
  return Number.isFinite(score) ? score : Number.NEGATIVE_INFINITY;
}

function isFresh(candidate: DecisionCandidate, now: Date): boolean {
  const expiresAt = Date.parse(candidate.expiresAt);
  return Number.isFinite(expiresAt) && expiresAt > now.getTime();
}
