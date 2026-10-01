export interface LLMProvider {
  readonly name: string;
  complete(prompt: string): Promise<string>;
}
