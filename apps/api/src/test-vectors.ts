import type { EmbeddingService } from "@semantic-llm/embeddings";
import { EMBEDDING_DIMENSIONS } from "@semantic-llm/shared";

export class HashEmbeddings implements EmbeddingService {
  readonly model = "fake";
  readonly dimensions = EMBEDDING_DIMENSIONS;

  async init(): Promise<void> {}

  async embed(text: string): Promise<number[]> {
    return hashEmbedding(text);
  }
}

export function hashEmbedding(text: string): number[] {
  const vector = Array.from({ length: EMBEDDING_DIMENSIONS }, () => 0);
  let hash = 2_166_136_261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  for (let index = 0; index < EMBEDDING_DIMENSIONS; index += 1) {
    hash ^= hash >>> 16;
    hash = Math.imul(hash, 2_246_822_507);
    hash ^= hash >>> 13;
    vector[index] = ((hash >>> 0) % 10_000) / 10_000 * 2 - 1;
  }
  return normalize(vector);
}

export function unitEmbedding(index: number): number[] {
  const vector = Array.from({ length: EMBEDDING_DIMENSIONS }, () => 0);
  vector[index] = 1;
  return vector;
}

export function blendEmbeddings(
  primary: number[],
  secondary: number[],
  secondaryWeight: number,
): number[] {
  const mixed = primary.map(
    (value, index) => value * (1 - secondaryWeight) + (secondary[index] ?? 0) * secondaryWeight,
  );
  return normalize(mixed);
}

export function dot(left: number[], right: number[]): number {
  let sum = 0;
  for (let index = 0; index < left.length; index += 1) {
    sum += (left[index] ?? 0) * (right[index] ?? 0);
  }
  return sum;
}

function normalize(vector: number[]): number[] {
  let sumOfSquares = 0;
  for (const value of vector) {
    sumOfSquares += value * value;
  }
  const magnitude = Math.sqrt(sumOfSquares);
  return vector.map((value) => value / magnitude);
}
