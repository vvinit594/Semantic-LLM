export type DecisionContext = {
  model: string;
  language: string;
  scope: string;
  threshold: number;
  now: Date;
};

/** A search neighbor. Question text is intentionally absent so this phase cannot apply safety guards. */
export type DecisionCandidate = {
  id: string;
  score: number;
  response: string;
  model: string;
  language: string;
  scope: string;
  expiresAt: string;
};

export type DecisionMissReason = "no-candidate" | "below-threshold" | "metadata" | "stale";

export type CacheDecision =
  | { decision: "hit"; id: string; response: string; score: number }
  | { decision: "miss"; reason: DecisionMissReason };

export class DecisionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DecisionError";
  }
}

/**
 * Choose HIT or MISS from similarity, metadata, and freshness.
 * Entity, number, and time-sensitive guards are a later phase.
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
  let reason: DecisionMissReason = "below-threshold";
  for (const candidate of ranked) {
    if (!Number.isFinite(candidate.score) || candidate.score < context.threshold) {
      break;
    }
    if (!metadataMatches(context, candidate)) {
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
    return {
      decision: "hit",
      id: candidate.id,
      response: candidate.response,
      score: candidate.score,
    };
  }
  return { decision: "miss", reason };
}

function rankScore(score: number): number {
  return Number.isFinite(score) ? score : Number.NEGATIVE_INFINITY;
}

function metadataMatches(context: DecisionContext, candidate: DecisionCandidate): boolean {
  return (
    sameText(context.model, candidate.model) &&
    sameLanguage(context.language, candidate.language) &&
    sameText(context.scope, candidate.scope)
  );
}

function sameText(left: string, right: string): boolean {
  const normalizedLeft = left.trim();
  const normalizedRight = right.trim();
  return normalizedLeft.length > 0 && normalizedLeft === normalizedRight;
}

function sameLanguage(left: string, right: string): boolean {
  const normalizedLeft = left.trim().toLowerCase();
  const normalizedRight = right.trim().toLowerCase();
  return normalizedLeft.length > 0 && normalizedLeft === normalizedRight;
}

function isFresh(candidate: DecisionCandidate, now: Date): boolean {
  const expiresAt = Date.parse(candidate.expiresAt);
  return Number.isFinite(expiresAt) && expiresAt > now.getTime();
}
