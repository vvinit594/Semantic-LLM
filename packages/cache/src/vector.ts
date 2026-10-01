import { randomUUID } from "node:crypto";
import {
  SCHEMA_FIELD_TYPE,
  SCHEMA_VECTOR_FIELD_ALGORITHM,
} from "redis";
import { EMBEDDING_DIMENSIONS } from "@semantic-llm/shared";
import type { CacheRedisClient } from "./redis";

export const VECTOR_INDEX = "idx:semantic";
export const VECTOR_KEY_PREFIX = "semantic:";

export type VectorCacheInput = {
  id?: string;
  query: string;
  embedding: number[];
  response: string;
  model: string;
  language: string;
  ttlSeconds: number;
  metadata?: Record<string, string>;
};

export type VectorCacheRecord = {
  id: string;
  query: string;
  embedding: number[];
  response: string;
  model: string;
  language: string;
  createdAt: string;
  expiresAt: string;
  metadata: Record<string, string>;
};

/** A nearest neighbor. `score` is cosine similarity. This layer does not decide HIT or MISS. */
export type VectorCandidate = {
  id: string;
  score: number;
  record: VectorCacheRecord;
};

export class VectorCacheError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VectorCacheError";
  }
}

export class VectorCache {
  private indexReady = false;

  constructor(private readonly redis: CacheRedisClient) {}

  async upsert(input: VectorCacheInput): Promise<VectorCacheRecord> {
    const record = toRecord(input);
    await this.ensureIndex();
    const key = vectorCacheKey(record.id);
    await this.redis.json.set(key, "$", record);
    await this.redis.expire(key, input.ttlSeconds);
    return record;
  }

  async get(id: string): Promise<VectorCacheRecord | undefined> {
    const value = await this.redis.json.get(vectorCacheKey(id));
    return readRecord(value);
  }

  async delete(id: string): Promise<void> {
    await this.redis.del(vectorCacheKey(id));
  }

  async search(embedding: number[], k: number): Promise<VectorCandidate[]> {
    assertEmbedding(embedding);
    if (!Number.isInteger(k) || k <= 0) {
      throw new VectorCacheError("k must be a positive integer");
    }
    await this.ensureIndex();

    const result = await this.redis.ft.search(
      VECTOR_INDEX,
      `*=>[KNN ${k} @embedding $query AS distance]`,
      {
        PARAMS: { query: embeddingToBuffer(embedding) },
        SORTBY: { BY: "distance", DIRECTION: "ASC" },
        DIALECT: 2,
        LIMIT: { from: 0, size: k },
        RETURN: ["distance"],
      },
    );

    const candidates: VectorCandidate[] = [];
    for (const document of result.documents) {
      const distance = readDistance(document.value.distance);
      if (distance === undefined) {
        continue;
      }
      const id = idFromKey(document.id);
      const record = await this.get(id);
      if (!record || Date.parse(record.expiresAt) <= Date.now()) {
        continue;
      }
      candidates.push({
        id,
        score: 1 - distance,
        record,
      });
    }
    return candidates;
  }

  private async ensureIndex(): Promise<void> {
    if (this.indexReady) {
      return;
    }
    try {
      await this.redis.ft.create(
        VECTOR_INDEX,
        {
          "$.embedding": {
            type: SCHEMA_FIELD_TYPE.VECTOR,
            AS: "embedding",
            ALGORITHM: SCHEMA_VECTOR_FIELD_ALGORITHM.FLAT,
            TYPE: "FLOAT32",
            DIM: EMBEDDING_DIMENSIONS,
            DISTANCE_METRIC: "COSINE",
          },
        },
        {
          ON: "JSON",
          PREFIX: VECTOR_KEY_PREFIX,
        },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (!/already exists/i.test(message)) {
        throw error;
      }
    }
    this.indexReady = true;
  }
}

export function vectorCacheKey(id: string): string {
  return `${VECTOR_KEY_PREFIX}${id}`;
}

function toRecord(input: VectorCacheInput): VectorCacheRecord {
  assertText(input.query, "query");
  assertText(input.response, "response");
  assertText(input.model, "model");
  assertText(input.language, "language");
  assertEmbedding(input.embedding);
  if (!Number.isInteger(input.ttlSeconds) || input.ttlSeconds <= 0) {
    throw new VectorCacheError("ttlSeconds must be a positive integer");
  }
  const id = input.id ?? randomUUID();
  if (!/^[A-Za-z0-9_-]+$/.test(id)) {
    throw new VectorCacheError("id must contain only letters, numbers, underscores, or hyphens");
  }
  const createdAt = new Date();
  return {
    id,
    query: input.query,
    embedding: input.embedding,
    response: input.response,
    model: input.model,
    language: input.language,
    createdAt: createdAt.toISOString(),
    expiresAt: new Date(createdAt.getTime() + input.ttlSeconds * 1000).toISOString(),
    metadata: input.metadata ?? {},
  };
}

function assertText(value: string, field: string): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new VectorCacheError(`${field} must be a non-empty string`);
  }
}

function assertEmbedding(embedding: number[]): void {
  if (embedding.length !== EMBEDDING_DIMENSIONS) {
    throw new VectorCacheError(
      `embedding must have ${EMBEDDING_DIMENSIONS} dimensions, received ${embedding.length}`,
    );
  }
  if (embedding.some((value) => !Number.isFinite(value))) {
    throw new VectorCacheError("embedding values must be finite numbers");
  }
}

function embeddingToBuffer(embedding: number[]): Buffer {
  return Buffer.from(Float32Array.from(embedding).buffer);
}

function readDistance(value: unknown): number | undefined {
  const distance = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(distance) ? distance : undefined;
}

function idFromKey(key: string): string {
  return key.startsWith(VECTOR_KEY_PREFIX) ? key.slice(VECTOR_KEY_PREFIX.length) : key;
}

function readRecord(value: unknown): VectorCacheRecord | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  const record = value as Partial<VectorCacheRecord>;
  if (
    typeof record.id !== "string" ||
    typeof record.query !== "string" ||
    typeof record.response !== "string" ||
    !Array.isArray(record.embedding)
  ) {
    return undefined;
  }
  return record as VectorCacheRecord;
}
