import assert from "node:assert/strict";
import { test } from "node:test";
import {
  EMBEDDING_DIMENSIONS,
  EmbeddingInputError,
  EmbeddingModelError,
  createLocalEmbeddingService,
  type EmbeddingExtractor,
} from "./service";

test("embed returns a fixed-dimension unit vector and loads the model once", async () => {
  let loads = 0;
  const service = createLocalEmbeddingService({
    createExtractor: async () => {
      loads += 1;
      return fakeExtractor(ones(EMBEDDING_DIMENSIONS));
    },
  });

  const first = await service.embed("What is machine learning?");
  const second = await service.embed("What is machine learning?");

  assert.equal(loads, 1);
  assert.equal(first.length, EMBEDDING_DIMENSIONS);
  assert.equal(second.length, EMBEDDING_DIMENSIONS);
  assert.ok(Math.abs(norm(first) - 1) < 1e-6);
  assert.ok(first.every((value, index) => value === second[index]));
});

test("blank text is rejected before the model loads", async () => {
  let loads = 0;
  const service = createLocalEmbeddingService({
    createExtractor: async () => {
      loads += 1;
      return fakeExtractor(ones(EMBEDDING_DIMENSIONS));
    },
  });

  await assert.rejects(() => service.embed("   "), EmbeddingInputError);
  await assert.rejects(() => service.embed(""), EmbeddingInputError);
  assert.equal(loads, 0);
});

test("initialization failure is reported and can be retried", async () => {
  let loads = 0;
  const service = createLocalEmbeddingService({
    createExtractor: async () => {
      loads += 1;
      if (loads === 1) {
        throw new Error("download failed");
      }
      return fakeExtractor(ones(EMBEDDING_DIMENSIONS));
    },
  });

  await assert.rejects(() => service.init(), (error: unknown) => {
    assert.ok(error instanceof EmbeddingModelError);
    assert.equal(error.message, "Failed to initialize the local embedding model");
    return true;
  });
  await service.init();
  assert.equal(loads, 2);
  assert.equal((await service.embed("hello")).length, EMBEDDING_DIMENSIONS);
});

test("a vector with the wrong length is rejected", async () => {
  const service = createLocalEmbeddingService({
    createExtractor: async () => fakeExtractor([1, 2, 3]),
  });

  await assert.rejects(() => service.embed("hello"), EmbeddingModelError);
});

function fakeExtractor(vector: number[]): EmbeddingExtractor {
  return async () => ({
    dims: [1, vector.length],
    tolist: () => [vector],
  });
}

function ones(length: number): number[] {
  return Array.from({ length }, () => 1);
}

function norm(vector: number[]): number {
  return Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
}
