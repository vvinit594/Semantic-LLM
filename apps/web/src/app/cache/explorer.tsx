"use client";

import { useEffect, useState, type FormEvent } from "react";
import { cacheResult, type CacheEntry, type CachePage } from "../../api-responses";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { FieldLabel, Input, Select } from "@/components/ui/input";
import { LoadingSkeleton } from "@/components/ui/loading-skeleton";
import { PageHeader } from "@/components/ui/page-header";
import { cn } from "@/components/cn";
import { MarkdownAnswer } from "../markdown-answer";

type CacheEntryType = "exact" | "semantic";

export function CacheExplorer({ apiUrl }: { apiUrl: string }) {
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");
  const [type, setType] = useState<"" | CacheEntryType>("");
  const [page, setPage] = useState<CachePage | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    void requestEntries(apiUrl, query, type, controller.signal).then((result) => {
      if (controller.signal.aborted) {
        return;
      }
      if (result.ok) {
        setPage(result.page);
        setError(null);
        setSelectedId((current) =>
          current !== null && result.page.entries.some((entry) => entryKey(entry) === current) ? current : null,
        );
      } else {
        setError(result.error);
      }
      setLoading(false);
      setRefreshing(false);
    });
    return () => {
      controller.abort();
    };
  }, [apiUrl, query, type, refreshKey]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = draft.trim();
    setRefreshing(true);
    if (next === query) {
      setRefreshKey((current) => current + 1);
      return;
    }
    setQuery(next);
  }

  function onRefresh() {
    setRefreshing(true);
    setRefreshKey((current) => current + 1);
  }

  const selected = page?.entries.find((entry) => entryKey(entry) === selectedId) ?? null;

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
      <PageHeader title="Cache Explorer" subtitle="Read-only view of stored questions and answers." />
      <form onSubmit={onSubmit} className="grid grid-cols-1 gap-3 rounded-card border border-line bg-surface p-4 sm:grid-cols-[minmax(0,1fr)_10rem_auto_auto] sm:items-end">
        <div className="flex min-w-0 flex-col gap-2">
          <FieldLabel htmlFor="cache-search">Search</FieldLabel>
          <Input
            id="cache-search"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Question, answer, or model"
          />
        </div>
        <div className="flex flex-col gap-2">
          <FieldLabel htmlFor="cache-type">Type</FieldLabel>
          <Select
            id="cache-type"
            value={type}
            onChange={(event) => {
              const next = event.target.value;
              setType(next === "exact" || next === "semantic" ? next : "");
              setRefreshing(true);
            }}
          >
            <option value="">All</option>
            <option value="exact">Exact</option>
            <option value="semantic">Semantic</option>
          </Select>
        </div>
        <Button type="submit">Search</Button>
        <Button type="button" variant="secondary" onClick={onRefresh} disabled={loading || refreshing}>
          {refreshing ? "Refreshing…" : "Refresh"}
        </Button>
      </form>

      {loading ? <LoadingSkeleton label="Loading cache entries…" /> : null}
      {error ? <ErrorState>{error}</ErrorState> : null}
      {!loading && !error && page && page.total === 0 ? (
        <EmptyState
          title={query || type ? "No matching entries" : "The cache is empty"}
          detail={query || type ? "No stored questions match this search." : "Answers appear here after a cache miss is stored."}
        />
      ) : null}
      {page && page.total > 0 ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="min-w-0">
            <p className="mb-3 text-xs text-faint">
              {page.truncated ? `Showing ${page.entries.length} of ${page.total} entries.` : `${page.total} ${page.total === 1 ? "entry" : "entries"}.`}
            </p>
            <ul className="flex flex-col gap-2">
              {page.entries.map((entry) => {
                const active = selected !== null && entryKey(selected) === entryKey(entry);
                return (
                  <li key={`${entry.type}:${entry.id}`}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(entryKey(entry))}
                      className={cn(
                        "w-full rounded-card border px-4 py-3 text-left transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                        active ? "border-accent bg-accent-soft" : "border-line bg-surface hover:bg-muted-surface",
                      )}
                    >
                      <Badge tone={entry.type === "exact" ? "accent" : "neutral"}>{entry.type}</Badge>
                      <span className="mt-2 block text-sm font-medium text-ink">{entry.query}</span>
                      <span className="mt-1 block text-xs text-secondary">{entry.model ?? "Model not stored"}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
          <div className="min-w-0">
            {selected ? <EntryDetail entry={selected} /> : <EmptyState title="Select an entry" detail="Choose a stored question to inspect the answer, model, and metadata." />}
          </div>
        </div>
      ) : null}
    </main>
  );
}

function EntryDetail({ entry }: { entry: CacheEntry }) {
  const metadata = Object.entries(entry.metadata);
  return (
    <Card>
      <Badge tone={entry.type === "exact" ? "accent" : "neutral"}>{entry.type} cache</Badge>
      <h2 className="mt-2 text-base font-semibold tracking-tight text-ink">{entry.query}</h2>
      <dl className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
        <Field label="Model" value={entry.model} />
        <Field label="Language" value={entry.language} />
        <Field label="Scope" value={entry.scope} />
        <Field label="Created" value={formatTime(entry.createdAt)} />
        <Field label="Expires" value={formatExpiry(entry.expiresAt)} />
      </dl>
      <div className="mt-4">
        <h3 className="text-sm font-medium text-ink">Answer</h3>
        <div className="mt-2 rounded-control border border-line bg-canvas px-3 py-2">
          <MarkdownAnswer text={entry.answer} />
        </div>
        {entry.answerTruncated ? (
          <p className="mt-2 text-sm text-secondary">The stored answer is longer than the portion shown here.</p>
        ) : null}
      </div>
      <div className="mt-4">
        <h3 className="text-sm font-medium text-ink">Metadata</h3>
        {metadata.length === 0 ? (
          <p className="mt-2 text-sm text-secondary">None stored.</p>
        ) : (
          <dl className="mt-2 flex flex-col gap-1 text-sm">
            {metadata.map(([key, value]) => (
              <div key={key} className="flex gap-2">
                <dt className="font-medium text-ink">{key}</dt>
                <dd className="break-words text-secondary">{value}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </Card>
  );
}

function entryKey(entry: CacheEntry): string {
  return `${entry.type}:${entry.id}`;
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-xs tracking-wide text-faint uppercase">{label}</dt>
      <dd className="mt-1 break-words text-ink">{value && value.trim().length > 0 ? value : "Not stored"}</dd>
    </div>
  );
}

function formatTime(value: string | null): string | null {
  if (!value) {
    return null;
  }
  const time = Date.parse(value);
  if (Number.isNaN(time)) {
    return null;
  }
  return new Date(time).toLocaleString();
}

function formatExpiry(value: string | null): string | null {
  if (!value) {
    return null;
  }
  const time = Date.parse(value);
  if (Number.isNaN(time)) {
    return null;
  }
  const formatted = new Date(time).toLocaleString();
  return time <= Date.now() ? `${formatted} (expired)` : formatted;
}

async function requestEntries(
  apiUrl: string,
  query: string,
  type: "" | CacheEntryType,
  signal?: AbortSignal,
): Promise<{ ok: true; page: CachePage } | { ok: false; error: string }> {
  const params = new URLSearchParams();
  if (query.length > 0) {
    params.set("q", query);
  }
  if (type.length > 0) {
    params.set("type", type);
  }
  const suffix = params.size > 0 ? `?${params.toString()}` : "";
  try {
    const response = await fetch(`${apiUrl.replace(/\/$/, "")}/api/cache${suffix}`, { signal });
    const body: unknown = await response.json().catch(() => null);
    return cacheResult(response.ok, body);
  } catch {
    return { ok: false, error: "The cache request failed." };
  }
}

