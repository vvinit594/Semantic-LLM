import { GoogleGenAI } from "@google/genai";
import type { LLMProvider } from "./provider";

export const DEFAULT_GEMINI_MODEL = "gemini-3.8-flash";

export class MissingGeminiApiKeyError extends Error {
  constructor() {
    super("GEMINI_API_KEY is not set");
    this.name = "MissingGeminiApiKeyError";
  }
}

export type LlmCompletion = {
  text: string;
  inputTokens: number;
  outputTokens: number;
};

type GeminiUsageMetadata = {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  thoughtsTokenCount?: number;
};

export class GeminiProvider implements LLMProvider {
  readonly name = "gemini";
  private client: GoogleGenAI | undefined;

  constructor(
    private readonly apiKey: string,
    private readonly model: string,
  ) {}

  async complete(prompt: string): Promise<string> {
    const completion = await this.completeWithUsage(prompt);
    return completion.text;
  }

  async completeWithUsage(prompt: string): Promise<LlmCompletion> {
    const response = await this.getClient().models.generateContent({
      model: this.model,
      contents: prompt,
    });
    const text = response.text?.trim() ?? "";
    if (!text) {
      throw new Error("Gemini returned an empty response");
    }
    const usage = readUsage(response);
    return { text, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens };
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
