"use client";

import { useEffect, useState } from "react";
import { cn } from "../cn";
import { Tooltip } from "../ui/tooltip";

type Health = "checking" | "operational" | "degraded" | "offline";

export function StatusIndicator({ apiUrl }: { apiUrl: string }) {
  const [health, setHealth] = useState<Health>("checking");

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(`${apiUrl.replace(/\/$/, "")}/health`, { signal: controller.signal });
        const body: unknown = await response.json().catch(() => null);
        if (!response.ok) {
          setHealth("degraded");
          return;
        }
        setHealth(readHealth(body));
      } catch {
        if (!controller.signal.aborted) {
          setHealth("offline");
        }
      }
    }
    void load();
    const timer = window.setInterval(() => void load(), 30_000);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [apiUrl]);

  const label = health === "checking" ? "Checking" : health === "operational" ? "Operational" : health === "degraded" ? "Degraded" : "Offline";

  return (
    <Tooltip label="Production API health">
      <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-2.5 py-1 text-xs text-secondary">
        <span
          aria-hidden="true"
          className={cn(
            "size-1.5 rounded-full",
            health === "operational" && "bg-success",
            health === "degraded" && "bg-warning",
            health === "offline" && "bg-danger",
            health === "checking" && "bg-faint",
          )}
        />
        <span className="hidden sm:inline">Production</span>
        <span className="font-medium text-ink">{label}</span>
      </span>
    </Tooltip>
  );
}

function readHealth(body: unknown): Health {
  if (typeof body !== "object" || body === null) {
    return "degraded";
  }
  const record = body as { redis?: unknown; embeddings?: unknown };
  if (record.redis !== "ok") {
    return "degraded";
  }
  if (record.embeddings === "error") {
    return "degraded";
  }
  return "operational";
}
