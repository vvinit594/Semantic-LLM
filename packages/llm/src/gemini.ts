import { GoogleGenAI } from "@google/genai";
import type { LLMProvider } from "./provider";

export const DEFAULT_GEMINI_MODEL = "gemini-3.8-flash";

export class MissingGeminiApiKeyError extends Error {
  constructor() {
    super("GEMINI_API_KEY is not set");
    this.name = "MissingGeminiApiKeyError";
  }
}

export class GeminiProvider implements LLMProvider {
  readonly name = "gemini";
  private client: GoogleGenAI | undefined;

  constructor(
    private readonly apiKey: string,
    private readonly model: string,
  ) {}

  async complete(prompt: string): Promise<string> {
    const response = await this.getClient().models.generateContent({
      model: this.model,
      contents: prompt,
    });
    const text = response.text?.trim() ?? "";
    if (!text) {
      throw new Error("Gemini returned an empty response");
    }
    return text;
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
