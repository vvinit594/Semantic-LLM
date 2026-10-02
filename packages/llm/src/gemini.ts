import { GoogleGenAI } from "@google/genai";
import type { LLMProvider } from "./provider";

export const DEFAULT_GEMINI_MODEL = "gemini-3.8-flash";
export const GEMINI_RETRY_ATTEMPTS = 3;
export const GEMINI_RETRY_BASE_DELAY_MS = 200;

const TRANSIENT_STATUSES = [429, 503] as const;
export type TransientGeminiStatus = (typeof TRANSIENT_STATUSES)[number];

type GeminiUsageMetadata = {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  thoughtsTokenCount?: number;
};

type GeminiResponse = {
  text?: string;
  usageMetadata?: GeminiUsageMetadata;
};

export type GeminiGenerate = (request: { model: string; contents: string }) => Promise<GeminiResponse>;

export type GeminiRetry = {
  maxAttempts?: number;
  baseDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
  generate?: GeminiGenerate;
};

export class MissingGeminiApiKeyError extends Error {
  constructor() {
    super("GEMINI_API_KEY is not set");
    this.name = "MissingGeminiApiKeyError";
  }
}

export class TransientGeminiError extends Error {
  readonly status: TransientGeminiStatus;

  constructor(status: TransientGeminiStatus, cause?: unknown) {
    super(transientGeminiMessage(status));
    this.name = "TransientGeminiError";
    this.status = status;
    if (cause !== undefined) {
      this.cause = cause;
    }
  }
}

export function transientGeminiMessage(status: TransientGeminiStatus): string {
  if (status === 429) {
    return "The model is rate limited. Please try again in a moment.";
  }
  return "The model is temporarily unavailable. Please try again in a moment.";
}

export function transientGeminiStatus(error: unknown): TransientGeminiStatus | undefined {
  const status = readStatus(error) ?? readStatusFromMessage(error);
  if (status === 429 || status === 503) {
    return status;
  }
  return undefined;
}

export class GeminiProvider implements LLMProvider {
  readonly name = "gemini";
  private client: GoogleGenAI | undefined;

  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly retry: GeminiRetry = {},
  ) {}

  async complete(prompt: string): Promise<string> {
    return (await this.completeWithUsage(prompt)).text;
  }

  async completeWithUsage(prompt: string): Promise<LlmCompletion> {
    const response = await withTransientRetry(
      () => this.generate(prompt),
      this.retry,
    );
    const text = response.text?.trim() ?? "";
    if (!text) {
      throw new Error("Gemini returned an empty response");
    }
    const usage = readUsage(response);
    return { text, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens };
  }

  private generate(prompt: string): Promise<GeminiResponse> {
    if (!this.apiKey.trim()) {
      throw new MissingGeminiApiKeyError();
    }
    if (this.retry.generate) {
      return this.retry.generate({ model: this.model, contents: prompt });
    }
    return this.getClient().models.generateContent({
      model: this.model,
      contents: prompt,
    });
  }

  private getClient(): GoogleGenAI {
    const apiKey = this.apiKey.trim();
    if (!apiKey) {
      throw new MissingGeminiApiKeyError();
    }
    this.client ??= new GoogleGenAI({ apiKey });
    return this.client;
  }
}

export async function withTransientRetry<T>(
  operation: () => Promise<T>,
  options: GeminiRetry = {},
): Promise<T> {
  const maxAttempts = Math.max(1, options.maxAttempts ?? GEMINI_RETRY_ATTEMPTS);
  const baseDelayMs = options.baseDelayMs ?? GEMINI_RETRY_BASE_DELAY_MS;
  const sleep = options.sleep ?? delay;
  let lastTransient: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      const status = transientGeminiStatus(error);
      if (status === undefined) {
        throw error;
      }
      lastTransient = error;
      if (attempt === maxAttempts) {
        throw new TransientGeminiError(status, error);
      }
      await sleep(baseDelayMs * 2 ** (attempt - 1));
    }
  }
  throw new TransientGeminiError(transientGeminiStatus(lastTransient) ?? 503, lastTransient);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function readStatus(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null) {
    return undefined;
  }
  const record = error as { status?: unknown; statusCode?: unknown };
  if (typeof record.status === "number") {
    return record.status;
  }
  if (typeof record.statusCode === "number") {
    return record.statusCode;
  }
  return undefined;
}

function readStatusFromMessage(error: unknown): number | undefined {
  if (!(error instanceof Error)) {
    return undefined;
  }
  try {
    const parsed: unknown = JSON.parse(error.message);
    if (typeof parsed !== "object" || parsed === null || !("error" in parsed)) {
      return undefined;
    }
    const body = parsed.error;
    if (typeof body !== "object" || body === null || !("code" in body)) {
      return undefined;
    }
    const code = body.code;
    return typeof code === "number" ? code : undefined;
  } catch {
    return undefined;
  }
}

export type LlmCompletion = {
  text: string;
  inputTokens: number;
  outputTokens: number;
};

function readUsage(response: { usageMetadata?: GeminiUsageMetadata }): {
  inputTokens: number;
  outputTokens: number;
} {
  const usage = response.usageMetadata;
  return {
    inputTokens: tokenCount(usage?.promptTokenCount),
    outputTokens: tokenCount(usage?.candidatesTokenCount) + tokenCount(usage?.thoughtsTokenCount),
  };
}

function tokenCount(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}
