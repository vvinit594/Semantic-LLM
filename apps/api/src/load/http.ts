import type { PlannedRequest } from "./plan";
import type { LoadObservation } from "./stats";

const REQUEST_TIMEOUT_MS = 30_000;

export async function sendLoadRequest(url: string, request: PlannedRequest): Promise<LoadObservation> {
  try {
    if (request.kind === "health") {
      return await sendHealth(url);
    }
    const response = await fetch(`${url}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: request.message }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      return { ok: false, cached: null, match: null };
    }
    return readChat(await response.json().catch(() => null));
  } catch {
    return { ok: false, cached: null, match: null };
  }
}

async function sendHealth(url: string): Promise<LoadObservation> {
  const response = await fetch(`${url}/health`, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (!response.ok) {
    return { ok: false, cached: null, match: null };
  }
  const body: unknown = await response.json().catch(() => null);
  if (typeof body !== "object" || body === null || !("redis" in body) || body.redis !== "ok") {
    return { ok: false, cached: null, match: null };
  }
  return { ok: true, cached: null, match: null };
}

function readChat(body: unknown): LoadObservation {
  if (typeof body !== "object" || body === null) {
    return { ok: false, cached: null, match: null };
  }
  const record = body as { cached?: unknown; match?: unknown };
  const match = record.match === "exact" || record.match === "semantic" || record.match === null ? record.match : undefined;
  if (typeof record.cached !== "boolean" || match === undefined) {
    return { ok: false, cached: null, match: null };
  }
  return { ok: true, cached: record.cached, match };
}
