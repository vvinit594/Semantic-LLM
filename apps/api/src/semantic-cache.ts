import type { VectorCacheInput, VectorCandidate } from "@semantic-llm/cache";
import { decideCache, type DecisionMissReason, type SafetyGuard } from "@semantic-llm/decision";
import type { EmbeddingService } from "@semantic-llm/embeddings";
import { embeddingText } from "@semantic-llm/query";

/** Starting candidate from the requirements list. Benchmarking chooses the measured value later. */
export const DEFAULT_SIMILARITY_THRESHOLD = 0.85;
export const DEFAULT_SEMANTIC_TOP_K = 5;

export type SemanticVectorStore = {
  search(embedding: number[], k: number): Promise<VectorCandidate[]>;
  upsert(input: VectorCacheInput): Promise<unknown>;
};

export type SemanticMatch =
  | {
      decision: "hit";
      answer: string;
      score: number;
      embedding: number[];
      embeddingMs: number;
      redisMs: number;
    }
  | {
      decision: "miss";
      embedding: number[];
      reason: DecisionMissReason;
      guard?: SafetyGuard;
      embeddingMs: number;
      redisMs: number;
    }
  | {
      decision: "unavailable";
      embedding?: number[];
      reason: unknown;
      embeddingMs: number;
      redisMs: number;
    };

export async function findSimilarAnswer(options: {
  query: string;
  embeddings: EmbeddingService;
  vectors: SemanticVectorStore;
  topK: number;
  threshold: number;
  model: string;
  language: string;
  scope: string;
  now?: Date;
}): Promise<SemanticMatch> {
  let embedding: number[];
  const embedStarted = performance.now();
  try {
    embedding = await options.embeddings.embed(embeddingText(options.query));
  } catch (error) {
    return { decision: "unavailable", reason: error, embeddingMs: elapsedMs(embedStarted), redisMs: 0 };
  }
  const embeddingMs = elapsedMs(embedStarted);

  let candidates: VectorCandidate[];
  const searchStarted = performance.now();
  try {
    candidates = await options.vectors.search(embedding, options.topK);
  } catch (error) {
    return { decision: "unavailable", embedding, reason: error, embeddingMs, redisMs: elapsedMs(searchStarted) };
  }
  const redisMs = elapsedMs(searchStarted);

  const decision = decideCache(
    {
      model: options.model,
      language: options.language,
      scope: options.scope,
      query: options.query,
      threshold: options.threshold,
      now: options.now ?? new Date(),
    },
    candidates.map((candidate) => ({
      id: candidate.id,
      query: candidate.record.query,
      score: candidate.score,
      response: candidate.record.response,
      model: candidate.record.model,
      language: candidate.record.language,
      scope: candidate.record.metadata.scope ?? "",
      expiresAt: candidate.record.expiresAt,
    })),
  );
  if (decision.decision === "hit") {
    return {
      decision: "hit",
      answer: decision.response,
      score: decision.score,
      embedding,
      embeddingMs,
      redisMs,
    };
  }
  return {
    decision: "miss",
    embedding,
    reason: decision.reason,
    embeddingMs,
    redisMs,
    ...(decision.reason === "guard" ? { guard: decision.guard } : {}),
  };
}

function elapsedMs(started: number): number {
  const value = performance.now() - started;
  return Number.isFinite(value) && value > 0 ? value : 0;
}
