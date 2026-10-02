import { createHash } from "node:crypto";
import { normalizeQuery } from "@semantic-llm/query";
import type { CacheRedisClient } from "./redis";

export const DEFAULT_EXACT_CACHE_TTL_SECONDS = 60 * 60 * 24;

type StoredEntry = {
  query: string;
  answer: string;
  model: string;
  createdAt: string;
};

export class ExactCache {
  constructor(
    private readonly redis: CacheRedisClient,
    private readonly ttlSeconds = DEFAULT_EXACT_CACHE_TTL_SECONDS,
  ) {
    if (!Number.isInteger(ttlSeconds) || ttlSeconds <= 0) {
      throw new Error("Exact cache TTL must be a positive integer number of seconds");
    }
  }

  async get(query: string, model: string): Promise<string | undefined> {
    if (!this.redis.isReady) {
      return undefined;
    }
    const raw = await this.redis.get(exactCacheKey(query, model));
    if (!raw) {
      return undefined;
    }
    const answer = readAnswer(raw);
    return answer;
  }

  async set(query: string, model: string, answer: string): Promise<void> {
    if (!this.redis.isReady) {
      return;
    }
    const entry: StoredEntry = {
      query,
      answer,
      model,
      createdAt: new Date().toISOString(),
    };
    await this.redis.set(exactCacheKey(query, model), JSON.stringify(entry), {
      EX: this.ttlSeconds,
    });
  }
}

export function exactCacheKey(query: string, model: string): string {
  const digest = createHash("sha256").update(`${model}\0${normalizeQuery(query)}`).digest("hex");
  return `exact:${digest}`;
}

function readAnswer(raw: string): string | undefined {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || !("answer" in parsed)) {
      return undefined;
    }
    const answer = parsed.answer;
    return typeof answer === "string" && answer.length > 0 ? answer : undefined;
  } catch {
    return undefined;
  }
}
