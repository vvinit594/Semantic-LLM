import { createClient, type RedisClientType } from "redis";

export type CacheRedisClient = RedisClientType;

export function createRedisClient(url: string): CacheRedisClient {
  return createClient({
    url,
    socket: {
      reconnectStrategy(retries: number) {
        return Math.min(100 * 2 ** Math.min(retries, 6), 5_000);
      },
    },
  });
}

export async function pingRedis(client: CacheRedisClient, timeoutMs = 1_000): Promise<boolean> {
  if (!client.isReady) {
    return false;
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("Redis ping timed out")), timeoutMs);
  });

  try {
    const response = await Promise.race([client.ping(), timeout]);
    return response === "PONG";
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}
