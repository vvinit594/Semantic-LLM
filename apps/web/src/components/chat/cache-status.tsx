import type { ReactNode } from "react";
import type { ChatReply } from "@/api-responses";

export function CacheStatus({ reply }: { reply: ChatReply }) {
  if (reply.cached && reply.match === "exact") {
    return (
      <StatusPanel tone="hit">
        <p className="text-sm font-medium text-success">✓ Exact cache HIT</p>
        <p className="mt-1 text-sm text-ink">{exactDetail(reply.similarity)}</p>
        <Savings />
        <MatchedQuery query={reply.matchedQuery} />
      </StatusPanel>
    );
  }

  if (reply.cached) {
    return (
      <StatusPanel tone="hit">
        <p className="text-sm font-medium text-success">✓ Semantic cache HIT</p>
        <p className="mt-1 text-sm text-ink">{semanticDetail(reply.similarity)}</p>
        <Savings />
        <MatchedQuery query={reply.matchedQuery} />
      </StatusPanel>
    );
  }

  return (
    <StatusPanel tone="miss">
      <p className="text-sm font-medium text-warning">↗ Cache MISS</p>
      <p className="mt-1 text-sm leading-6 text-ink">No sufficiently similar cached answer was found.</p>
      <p className="mt-2 text-sm font-medium text-ink">Answered by model</p>
    </StatusPanel>
  );
}

function StatusPanel({ tone, children }: { tone: "hit" | "miss"; children: ReactNode }) {
  const border = tone === "hit" ? "border-success/30 bg-success-soft" : "border-warning/30 bg-warning-soft";
  return <div className={`chat-in rounded-control border px-3 py-3 ${border}`}>{children}</div>;
}

function Savings() {
  return <p className="mt-2 text-sm font-medium text-ink">LLM request avoided</p>;
}

function MatchedQuery({ query }: { query: string | null }) {
  if (!query) {
    return null;
  }
  return (
    <p className="mt-3 text-sm leading-6 text-secondary">
      <span className="block text-xs font-medium tracking-wide text-faint uppercase">Matched query</span>
      <span className="mt-1 block text-ink">“{query}”</span>
    </p>
  );
}

function exactDetail(similarity: number | null): string {
  const percent = formatPercent(similarity);
  return percent ? `${percent} exact match` : "Exact match";
}

function semanticDetail(similarity: number | null): string {
  const percent = formatPercent(similarity);
  return percent ? `${percent} similarity` : "Similarity unavailable";
}

function formatPercent(similarity: number | null): string | null {
  if (typeof similarity !== "number" || !Number.isFinite(similarity)) {
    return null;
  }
  const percent = similarity * 100;
  return `${percent.toFixed(percent >= 99.95 ? 0 : 1)}%`;
}
