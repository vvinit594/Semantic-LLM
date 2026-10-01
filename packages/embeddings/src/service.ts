import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { env, pipeline, type Tensor } from "@huggingface/transformers";

/** Sentence-transformers model. The ONNX build below is what Transformers.js can run locally. */
export const EMBEDDING_MODEL = "all-MiniLM-L6-v2";
export const EMBEDDING_MODEL_ID = "onnx-community/all-MiniLM-L6-v2-ONNX";
export const EMBEDDING_DIMENSIONS = 384;
export const MAX_EMBEDDING_INPUT_LENGTH = 8_000;

const cacheDir = resolve(dirname(fileURLToPath(import.meta.url)), "../.cache");

export interface EmbeddingService {
  readonly model: string;
  readonly dimensions: number;
  init(): Promise<void>;
  embed(text: string): Promise<number[]>;
}

export class EmbeddingInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmbeddingInputError";
  }
}

export class EmbeddingModelError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "EmbeddingModelError";
  }
}

export type EmbeddingExtractor = (
  text: string,
  options: { pooling: "mean"; normalize: true },
) => Promise<Pick<Tensor, "dims" | "tolist">>;

export type EmbeddingExtractorFactory = () => Promise<EmbeddingExtractor>;

export class LocalEmbeddingService implements EmbeddingService {
  readonly model = EMBEDDING_MODEL;
  readonly dimensions = EMBEDDING_DIMENSIONS;
  private extractor: EmbeddingExtractor | undefined;
  private loading: Promise<void> | undefined;

  constructor(private readonly createExtractor: EmbeddingExtractorFactory) {}

  async init(): Promise<void> {
    if (this.extractor) {
      return;
    }
    this.loading ??= this.load().catch((error: unknown) => {
      this.loading = undefined;
      throw error;
    });
    await this.loading;
  }

  async embed(text: string): Promise<number[]> {
    const prepared = prepareText(text);
    await this.init();
    const extractor = this.extractor;
    if (!extractor) {
      throw new EmbeddingModelError("The local embedding model is not initialized");
    }

    let output: Pick<Tensor, "dims" | "tolist">;
    try {
      output = await extractor(prepared, { pooling: "mean", normalize: true });
    } catch (error) {
      throw new EmbeddingModelError("The local embedding model failed to embed text", { cause: error });
    }
    return normalize(readVector(output));
  }

  private async load(): Promise<void> {
    try {
      this.extractor = await this.createExtractor();
    } catch (error) {
      throw new EmbeddingModelError("Failed to initialize the local embedding model", { cause: error });
    }
  }
}

export function createLocalEmbeddingService(
  options: { createExtractor?: EmbeddingExtractorFactory } = {},
): LocalEmbeddingService {
  return new LocalEmbeddingService(options.createExtractor ?? createTransformersExtractor);
}

async function createTransformersExtractor(): Promise<EmbeddingExtractor> {
  env.cacheDir = cacheDir;
  const extractor = await pipeline("feature-extraction", EMBEDDING_MODEL_ID);
  return (text, options) => extractor(text, options);
}

function prepareText(text: string): string {
  if (typeof text !== "string") {
    throw new EmbeddingInputError("text must be a string");
  }
  const trimmed = text.trim();
  if (!trimmed) {
    throw new EmbeddingInputError("text must be a non-empty string");
  }
  if (trimmed.length > MAX_EMBEDDING_INPUT_LENGTH) {
    throw new EmbeddingInputError(
      `text must be at most ${MAX_EMBEDDING_INPUT_LENGTH} characters`,
    );
  }
  return trimmed;
}

function readVector(output: Pick<Tensor, "dims" | "tolist">): number[] {
  const listed: unknown = output.tolist();
  if (!Array.isArray(listed)) {
    throw new EmbeddingModelError("The embedding model returned an unreadable vector");
  }
  const row: unknown = Array.isArray(listed[0]) ? listed[0] : listed;
  if (!Array.isArray(row) || row.length !== EMBEDDING_DIMENSIONS) {
    throw new EmbeddingModelError(
      `Expected a ${EMBEDDING_DIMENSIONS}-dimension vector, received ${Array.isArray(row) ? row.length : 0}`,
    );
  }
  return row.map((value) => {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new EmbeddingModelError("The embedding model returned a non-finite value");
    }
    return value;
  });
}

function normalize(vector: number[]): number[] {
  let sumOfSquares = 0;
  for (const value of vector) {
    sumOfSquares += value * value;
  }
  const norm = Math.sqrt(sumOfSquares);
  if (!Number.isFinite(norm) || norm === 0) {
    throw new EmbeddingModelError("The embedding vector cannot be normalized");
  }
  return vector.map((value) => value / norm);
}
