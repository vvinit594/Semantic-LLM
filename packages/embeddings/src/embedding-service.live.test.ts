import assert from "node:assert/strict";
import { test } from "node:test";
import { EMBEDDING_DIMENSIONS, createLocalEmbeddingService } from "./service";

test("the local MiniLM model embeds text to a normalized 384-dimension vector", async () => {
  const service = createLocalEmbeddingService();
  await service.init();

  const machineLearning = await service.embed("What is machine learning?");
  const repeated = await service.embed("What is machine learning?");
  const paraphrase = await service.embed("Can you explain machine learning?");
  const unrelated = await service.embed("How do I boil pasta?");

  assert.equal(service.model, "all-MiniLM-L6-v2");
  assert.equal(service.dimensions, EMBEDDING_DIMENSIONS);
  assert.equal(machineLearning.length, EMBEDDING_DIMENSIONS);
  assert.ok(machineLearning.every((value) => Number.isFinite(value)));
  assert.ok(Math.abs(norm(machineLearning) - 1) < 1e-5);
  assert.ok(maxAbsDifference(machineLearning, repeated) < 1e-5);

  const paraphraseScore = dot(machineLearning, paraphrase);
  const unrelatedScore = dot(machineLearning, unrelated);
  assert.ok(paraphraseScore > unrelatedScore);
  assert.ok(paraphraseScore > 0.4);
});

function norm(vector: number[]): number {
  return Math.sqrt(dot(vector, vector));
}

function dot(left: number[], right: number[]): number {
  let sum = 0;
  for (let index = 0; index < left.length; index += 1) {
    sum += (left[index] ?? 0) * (right[index] ?? 0);
  }
  return sum;
}

function maxAbsDifference(left: number[], right: number[]): number {
  let max = 0;
  for (let index = 0; index < left.length; index += 1) {
    max = Math.max(max, Math.abs((left[index] ?? 0) - (right[index] ?? 0)));
  }
  return max;
}
