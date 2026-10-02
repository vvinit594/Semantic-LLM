import assert from "node:assert/strict";
import { test } from "node:test";
import type { VectorCacheInput, VectorCacheRecord, VectorCandidate } from "@semantic-llm/cache";
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

test("a perfect score still misses when the entry is stale or the metadata differs", async () => {
  const stale = await findSimilarAnswer({
    query: "Which city is the capital of France?",
    embeddings: new FixedEmbeddings([1, 0]),
    vectors: new FixedStore(record({ expiresAt: "2026-10-01T00:00:00.000Z" })),
    topK: 5,
    threshold: DEFAULT_SIMILARITY_THRESHOLD,
    ...requestContext,
  });
  const language = await findSimilarAnswer({
    query: "Which city is the capital of France?",
    embeddings: new FixedEmbeddings([1, 0]),
    vectors: new FixedStore(record({ language: "fr" })),
    topK: 5,
    threshold: DEFAULT_SIMILARITY_THRESHOLD,
    ...requestContext,
  });
  const scope = await findSimilarAnswer({
    query: "Which city is the capital of France?",
    embeddings: new FixedEmbeddings([1, 0]),
    vectors: new FixedStore(record({ metadata: { scope: "private" } })),
    topK: 5,
    threshold: DEFAULT_SIMILARITY_THRESHOLD,
    ...requestContext,
  });

  assert.equal(stale.decision, "miss");
  assert.equal(language.decision, "miss");
  assert.equal(scope.decision, "miss");
  if (stale.decision === "miss") {
    assert.equal(stale.reason, "stale");
  }
  if (language.decision === "miss") {
    assert.equal(language.reason, "metadata");
  }
  if (scope.decision === "miss") {
    assert.equal(scope.reason, "metadata");
  }
});

test("entity, number, and time guards miss at a perfect score", async () => {
  const entity = await findSimilarAnswer({
    query: "What is the capital of China?",
    embeddings: new FixedEmbeddings([1, 0]),
    vectors: new FixedStore(record({ query: "What is the capital of France?" })),
    topK: 5,
    threshold: DEFAULT_SIMILARITY_THRESHOLD,
    ...requestContext,
  });
  const number = await findSimilarAnswer({
    query: "What is 2 + 3?",
    embeddings: new FixedEmbeddings([1, 0]),
    vectors: new FixedStore(record({ query: "What is 2 + 2?" })),
    topK: 5,
    threshold: DEFAULT_SIMILARITY_THRESHOLD,
    ...requestContext,
  });
  const time = await findSimilarAnswer({
    query: "What is the latest capital of France?",
    embeddings: new FixedEmbeddings([1, 0]),
    vectors: new FixedStore(record({ query: "What is the capital of France?" })),
    topK: 5,
    threshold: DEFAULT_SIMILARITY_THRESHOLD,
    ...requestContext,
  });

  assert.equal(entity.decision, "miss");
  assert.equal(number.decision, "miss");
  assert.equal(time.decision, "miss");
  if (entity.decision === "miss") {
    assert.equal(entity.reason, "guard");
    assert.equal(entity.guard, "entity");
  }
  if (number.decision === "miss") {
    assert.equal(number.reason, "guard");
    assert.equal(number.guard, "number");
  }
  if (time.decision === "miss") {
    assert.equal(time.reason, "guard");
    assert.equal(time.guard, "time");
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

class FixedStore implements SemanticVectorStore {
  constructor(private readonly stored: VectorCacheRecord) {}

  async search(): Promise<VectorCandidate[]> {
    return [{ id: this.stored.id, score: 1, record: this.stored }];
  }

  async upsert(_input: VectorCacheInput): Promise<unknown> {
    return undefined;
  }
}

function record(overrides: Partial<VectorCacheRecord>): VectorCacheRecord {
  return {
    id: "candidate",
    query: "What is the capital of France?",
    embedding: [1, 0],
    response: storedAnswer,
    model: "fake:test",
    language: "und",
    createdAt: "2026-10-02T00:00:00.000Z",
    expiresAt: "2026-10-03T00:00:00.000Z",
    metadata: { scope: "public" },
    ...overrides,
  };
}

class FailingStore implements SemanticVectorStore {
  async search(): Promise<VectorCandidate[]> {
    throw new Error("search failed");
  }

  async upsert(_input: VectorCacheInput): Promise<unknown> {
    throw new Error("store failed");
  }
}
