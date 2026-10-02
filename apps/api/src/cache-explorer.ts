import { EXACT_KEY_PREFIX, VECTOR_KEY_PREFIX, type CacheRedisClient } from "@semantic-llm/cache";

const ANSWER_LIMIT = 20_000;
const RESULT_LIMIT = 100;

export class CacheExplorerUnavailableError extends Error {
  constructor() {
    super("The cache is not available.");
    this.name = "CacheExplorerUnavailableError";
  }
}

export type CacheEntryType = "exact" | "semantic";

export type CacheExplorerEntry = {
  id: string;
  type: CacheEntryType;
  query: string;
  answer: string;
  answerTruncated: boolean;
  model: string | null;
  language: string | null;
  scope: string | null;
  createdAt: string | null;
  expiresAt: string | null;
  metadata: Record<string, string>;
};

export type CacheExplorerQuery = {
  q: string;
  type?: CacheEntryType;
};

export type CacheExplorerPage = {
  entries: CacheExplorerEntry[];
  total: number;
  truncated: boolean;
};

export function cacheSecrets(env: NodeJS.ProcessEnv = process.env): string[] {
  const secrets = [env.GEMINI_API_KEY, env.REDIS_URL];
  return secrets.filter((value): value is string => typeof value === "string" && value.trim().length >= 12).map((value) => value.trim());
}

export async function loadCacheEntries(
  redis: CacheRedisClient,
  secrets: readonly string[],
): Promise<CacheExplorerEntry[]> {
  if (!redis.isReady) {
    throw new CacheExplorerUnavailableError();
  }
  const entries: CacheExplorerEntry[] = [];
  for (const key of await scanKeys(redis, `${EXACT_KEY_PREFIX}*`)) {
    const entry = await readExact(redis, key, secrets);
    if (entry) {
      entries.push(entry);
    }
  }
  for (const key of await scanKeys(redis, `${VECTOR_KEY_PREFIX}*`)) {
    const entry = await readSemantic(redis, key, secrets);
    if (entry) {
      entries.push(entry);
    }
  }
  return entries;
}

export function filterCacheEntries(entries: readonly CacheExplorerEntry[], query: CacheExplorerQuery): CacheExplorerPage {
  const needle = query.q.trim().toLowerCase();
  const matched = entries.filter((entry) => {
    if (query.type !== undefined && entry.type !== query.type) {
      return false;
    }
    if (needle.length === 0) {
      return true;
    }
    return searchableText(entry).includes(needle);
  });
  matched.sort(compareEntries);
  return {
    entries: matched.slice(0, RESULT_LIMIT),
    total: matched.length,
    truncated: matched.length > RESULT_LIMIT,
  };
}

export function readCacheQuery(query: unknown): { ok: true; query: CacheExplorerQuery } | { ok: false; error: string } {
  if (typeof query !== "object" || query === null) {
    return { ok: true, query: { q: "" } };
  }
  const record = query as { q?: unknown; type?: unknown };
  if (record.q !== undefined && (typeof record.q !== "string" || record.q.length > 200)) {
    return { ok: false, error: "q must be a string up to 200 characters" };
  }
  if (record.type !== undefined && record.type !== "exact" && record.type !== "semantic") {
    return { ok: false, error: "type must be exact or semantic" };
  }
  return {
    ok: true,
    query: {
      q: typeof record.q === "string" ? record.q : "",
      ...(record.type === "exact" || record.type === "semantic" ? { type: record.type } : {}),
    },
  };
}

export function redactText(value: string, secrets: readonly string[]): string {
  let text = value.replace(/AIza[0-9A-Za-z\-_]{20,}/g, "[redacted]");
  for (const secret of secrets) {
    if (secret.length > 0) {
      text = text.replaceAll(secret, "[redacted]");
    }
  }
  return text;
}

async function readExact(
  redis: CacheRedisClient,
  key: string,
  secrets: readonly string[],
): Promise<CacheExplorerEntry | undefined> {
  const raw = await redis.get(key);
  if (!raw) {
    return undefined;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (typeof parsed !== "object" || parsed === null) {
    return undefined;
  }
  const record = parsed as { query?: unknown; answer?: unknown; model?: unknown; createdAt?: unknown };
  if (typeof record.query !== "string" || typeof record.answer !== "string" || record.answer.length === 0) {
    return undefined;
  }
  const ttl = await redis.ttl(key);
  const answer = limitAnswer(redactText(record.answer, secrets));
  return {
    id: key.startsWith(EXACT_KEY_PREFIX) ? key.slice(EXACT_KEY_PREFIX.length) : key,
    type: "exact",
    query: redactText(record.query, secrets),
    answer: answer.text,
    answerTruncated: answer.truncated,
    model: readOptionalText(record.model, secrets),
    language: null,
    scope: null,
    createdAt: readTimestamp(record.createdAt),
    expiresAt: ttl > 0 ? new Date(Date.now() + ttl * 1000).toISOString() : null,
    metadata: {},
  };
}

async function readSemantic(
  redis: CacheRedisClient,
  key: string,
  secrets: readonly string[],
): Promise<CacheExplorerEntry | undefined> {
  const value: unknown = await redis.json.get(key);
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  if (typeof record.query !== "string" || typeof record.response !== "string" || record.response.length === 0) {
    return undefined;
  }
  const metadata = readMetadata(record.metadata, secrets);
  const answer = limitAnswer(redactText(record.response, secrets));
  const id = typeof record.id === "string" && record.id.length > 0
    ? record.id
    : key.startsWith(VECTOR_KEY_PREFIX)
      ? key.slice(VECTOR_KEY_PREFIX.length)
      : key;
  return {
    id,
    type: "semantic",
    query: redactText(record.query, secrets),
    answer: answer.text,
    answerTruncated: answer.truncated,
    model: readOptionalText(record.model, secrets),
    language: readOptionalText(record.language, secrets),
    scope: metadata.scope ?? null,
    createdAt: readTimestamp(record.createdAt),
    expiresAt: readTimestamp(record.expiresAt),
    metadata,
  };
}

function readMetadata(value: unknown, secrets: readonly string[]): Record<string, string> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }
  const metadata: Record<string, string> = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === "string") {
      metadata[redactText(key, secrets)] = redactText(item, secrets);
    }
  }
  return metadata;
}

function readOptionalText(value: unknown, secrets: readonly string[]): string | null {
  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }
  return redactText(value, secrets);
}

function readTimestamp(value: unknown): string | null {
  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }
  return Number.isNaN(Date.parse(value)) ? null : value;
}

function limitAnswer(answer: string): { text: string; truncated: boolean } {
  if (answer.length <= ANSWER_LIMIT) {
    return { text: answer, truncated: false };
  }
  return { text: answer.slice(0, ANSWER_LIMIT), truncated: true };
}

function searchableText(entry: CacheExplorerEntry): string {
  return [entry.query, entry.answer, entry.model ?? "", entry.language ?? "", entry.scope ?? ""].join("\n").toLowerCase();
}

function compareEntries(left: CacheExplorerEntry, right: CacheExplorerEntry): number {
  const leftTime = Date.parse(left.createdAt ?? "");
  const rightTime = Date.parse(right.createdAt ?? "");
  const leftRank = Number.isNaN(leftTime) ? 0 : leftTime;
  const rightRank = Number.isNaN(rightTime) ? 0 : rightTime;
  return rightRank - leftRank || left.query.localeCompare(right.query);
}

async function scanKeys(redis: CacheRedisClient, match: string): Promise<string[]> {
  const keys: string[] = [];
  let cursor = "0";
  do {
    const page = await redis.scan(cursor, { MATCH: match, COUNT: 200 });
    cursor = String(page.cursor);
    keys.push(...page.keys);
  } while (cursor !== "0");
  return keys;
}
