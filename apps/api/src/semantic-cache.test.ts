import assert from "node:assert/strict";
import { test } from "node:test";
import type { VectorCacheInput, VectorCandidate } from "@semantic-llm/cache";
import type { EmbeddingService } from "@semantic-llm/embeddings";
import { DEFAULT_SIMILARITY_THRESHOLD, findSimilarAnswer, type SemanticVectorStore } from "./semantic-cache";

const storedAnswer = "Paris is the capital of France.";
const requestContext = {
  model: "fake:test",
  language: "und",
  scope: "public",
  now: new Date("2026-10-02T00:00:00.000Z"),
};

test("a candidate at the threshold is a hit and a lower score is a miss", async () => {
  const atThreshold = await findSimilarAnswer({
    query: "Which city is the capital of France?",
    embeddings: new FixedEmbeddings([0.1, 0.2]),
    vectors: new RankedStore(DEFAULT_SIMILARITY_THRESHOLD),
    topK: 5,
    threshold: DEFAULT_SIMILARITY_THRESHOLD,
    ...requestContext,
  });
  const below = await findSimilarAnswer({
    query: "How do I boil pasta?",
    embeddings: new FixedEmbeddings([0.3, 0.4]),
    vectors: new RankedStore(DEFAULT_SIMILARITY_THRESHOLD - 0.01),
    topK: 5,
    threshold: DEFAULT_SIMILARITY_THRESHOLD,
    ...requestContext,
  });

  assert.equal(atThreshold.decision, "hit");
  if (atThreshold.decision === "hit") {
    assert.equal(atThreshold.answer, storedAnswer);
    assert.equal(atThreshold.score, DEFAULT_SIMILARITY_THRESHOLD);
  }
  assert.equal(below.decision, "miss");
  if (below.decision === "miss") {
    assert.deepEqual(below.embedding, [0.3, 0.4]);
  }
});

test("an embedding failure skips matching and a search failure still keeps the vector", async () => {
  const embedFailed = await findSimilarAnswer({
    query: "What is the capital of France?",
    embeddings: new FailingEmbeddings(),
    vectors: new RankedStore(1),
    topK: 5,
    threshold: DEFAULT_SIMILARITY_THRESHOLD,
    ...requestContext,
  });
  const searchFailed = await findSimilarAnswer({
    query: "What is the capital of France?",
    embeddings: new FixedEmbeddings([1, 0]),
    vectors: new FailingStore(),
    topK: 5,
    threshold: DEFAULT_SIMILARITY_THRESHOLD,
    ...requestContext,
  });

  assert.equal(embedFailed.decision, "unavailable");
  if (embedFailed.decision === "unavailable") {
    assert.equal(embedFailed.embedding, undefined);
    assert.ok(embedFailed.reason instanceof Error);
    assert.equal(embedFailed.reason.message, "embed failed");
  }
  assert.equal(searchFailed.decision, "unavailable");
  if (searchFailed.decision === "unavailable") {
    assert.deepEqual(searchFailed.embedding, [1, 0]);
  }
});

class FixedEmbeddings implements EmbeddingService {
  readonly model = "fake";
  readonly dimensions = 2;

  constructor(private readonly vector: number[]) {}

  async init(): Promise<void> {}

  async embed(): Promise<number[]> {
    return this.vector;
  }
}

class FailingEmbeddings implements EmbeddingService {
  readonly model = "fake";
  readonly dimensions = 2;

  async init(): Promise<void> {}

  async embed(): Promise<number[]> {
    throw new Error("embed failed");
  }
}

class RankedStore implements SemanticVectorStore {
  constructor(private readonly score: number) {}

  async search(): Promise<VectorCandidate[]> {
    return [
      {
        id: "candidate",
        score: this.score,
        record: {
          id: "candidate",
          query: "What is the capital of France?",
          embedding: [1, 0],
          response: storedAnswer,
          model: "fake:test",
          language: "und",
          createdAt: "2026-10-02T00:00:00.000Z",
          expiresAt: "2026-10-03T00:00:00.000Z",
          metadata: { scope: "public" },
        },
      },
    ];
  }

  async upsert(_input: VectorCacheInput): Promise<unknown> {
    return undefined;
  }
}

class FailingStore implements SemanticVectorStore {
  async search(): Promise<VectorCandidate[]> {
    throw new Error("search failed");
  }

  async upsert(_input: VectorCacheInput): Promise<unknown> {
    throw new Error("store failed");
  }
}
