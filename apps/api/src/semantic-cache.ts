import type { VectorCacheInput, VectorCandidate } from "@semantic-llm/cache";
import { decideCache, type DecisionMissReason, type SafetyGuard } from "@semantic-llm/decision";
import type { EmbeddingService } from "@semantic-llm/embeddings";

/** Starting candidate from the requirements list. Benchmarking chooses the measured value later. */
export const DEFAULT_SIMILARITY_THRESHOLD = 0.85;
export const DEFAULT_SEMANTIC_TOP_K = 5;

export type SemanticVectorStore = {
  search(embedding: number[], k: number): Promise<VectorCandidate[]>;
  upsert(input: VectorCacheInput): Promise<unknown>;
};

export type SemanticMatch =
  | { decision: "hit"; answer: string; score: number; embedding: number[] }
  | { decision: "miss"; embedding: number[]; reason: DecisionMissReason; guard?: SafetyGuard }
  | { decision: "unavailable"; embedding?: number[]; reason: unknown };

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
  try {
    embedding = await options.embeddings.embed(options.query);
  } catch (error) {
    return { decision: "unavailable", reason: error };
  }

  let candidates: VectorCandidate[];
  try {
    candidates = await options.vectors.search(embedding, options.topK);
  } catch (error) {
    return { decision: "unavailable", embedding, reason: error };
  }

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
    };
  }
  return {
    decision: "miss",
    embedding,
    reason: decision.reason,
    ...(decision.reason === "guard" ? { guard: decision.guard } : {}),
  };
}
