import { exactCacheKey, type CacheRedisClient } from "@semantic-llm/cache";

export async function deleteLoadEntries(
  redis: CacheRedisClient,
  cacheModel: string,
  messages: Iterable<string>,
): Promise<void> {
  for (const message of messages) {
    await redis.del(exactCacheKey(message, cacheModel));
  }
  let cursor = "0";
  do {
    const page = await redis.scan(cursor, { MATCH: "semantic:*", COUNT: 200 });
    cursor = String(page.cursor);
    for (const key of page.keys) {
      const model = readModel(await redis.json.get(key, { path: "$.model" }));
      if (model === cacheModel) {
        await redis.del(key);
      }
    }
  } while (cursor !== "0");
}

function readModel(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    const first = value[0];
    return typeof first === "string" ? first : undefined;
  }
  if (typeof value === "object" && value !== null && "model" in value && typeof value.model === "string") {
    return value.model;
  }
  return undefined;
}
