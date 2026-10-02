"use client";

import { useEffect, useState, type FormEvent } from "react";
import { cacheResult, type CacheEntry, type CachePage } from "../../api-responses";
import { MarkdownAnswer } from "../markdown-answer";
import { SiteHeader } from "../site-header";

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
    <div className="flex min-h-screen flex-col">
      <SiteHeader current="cache" wide description="Read-only view of stored questions and answers." />
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-6 py-6">
        <form onSubmit={onSubmit} className="flex flex-col gap-3 rounded-md border border-neutral-200 px-4 py-3 sm:flex-row sm:items-end">
          <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm font-medium">
            Search
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Question, answer, or model"
              className="w-full rounded-md border border-neutral-300 px-3 py-2 font-normal outline-none focus:border-neutral-900"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Type
            <select
              value={type}
              onChange={(event) => {
                const next = event.target.value;
                setType(next === "exact" || next === "semantic" ? next : "");
                setRefreshing(true);
              }}
              className="rounded-md border border-neutral-300 bg-white px-3 py-2 font-normal outline-none focus:border-neutral-900"
            >
              <option value="">All</option>
              <option value="exact">Exact</option>
              <option value="semantic">Semantic</option>
            </select>
          </label>
          <button
            type="submit"
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white"
          >
            Search
          </button>
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading || refreshing}
            className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium disabled:bg-neutral-100"
          >
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
        </form>

        {loading ? <p className="text-sm text-neutral-500" role="status">Loading cache entries…</p> : null}
        {error ? <p className="text-sm text-red-700" role="alert">{error}</p> : null}
        {!loading && !error && page && page.total === 0 ? (
          <p className="text-sm text-neutral-500" role="status">
            {query || type ? "No cache entries match this search." : "The cache has no entries."}
          </p>
        ) : null}
        {page && page.total > 0 ? (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className="min-w-0">
              <p className="mb-3 text-sm text-neutral-600">
                {page.truncated ? `Showing ${page.entries.length} of ${page.total} entries.` : `${page.total} ${page.total === 1 ? "entry" : "entries"}.`}
              </p>
              <ul className="flex flex-col gap-2">
                {page.entries.map((entry) => (
                  <li key={`${entry.type}:${entry.id}`}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(entryKey(entry))}
                      className={`w-full rounded-md border px-4 py-3 text-left ${selected && entryKey(selected) === entryKey(entry) ? "border-neutral-900 bg-neutral-50" : "border-neutral-200"}`}
                    >
                      <span className="text-xs font-medium tracking-wide text-neutral-500 uppercase">{entry.type}</span>
                      <span className="mt-1 block text-sm font-medium">{entry.query}</span>
                      <span className="mt-1 block text-sm text-neutral-600">{entry.model ?? "Model not stored"}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
            <div className="min-w-0">
              {selected ? <EntryDetail entry={selected} /> : <p className="text-sm text-neutral-500">Select an entry to inspect it.</p>}
            </div>
          </div>
        ) : null}
      </main>
    </div>
  );
}

function EntryDetail({ entry }: { entry: CacheEntry }) {
  const metadata = Object.entries(entry.metadata);
  return (
    <article className="rounded-md border border-neutral-200 bg-neutral-50 px-4 py-3">
      <p className="text-xs font-medium tracking-wide text-neutral-500 uppercase">{entry.type} cache</p>
      <h2 className="mt-1 text-base font-semibold">{entry.query}</h2>
      <dl className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
        <Field label="Model" value={entry.model} />
        <Field label="Language" value={entry.language} />
        <Field label="Scope" value={entry.scope} />
        <Field label="Created" value={formatTime(entry.createdAt)} />
        <Field label="Expires" value={formatExpiry(entry.expiresAt)} />
      </dl>
      <div className="mt-4">
        <h3 className="text-sm font-medium">Answer</h3>
        <div className="mt-2 rounded-md border border-neutral-200 bg-white px-3 py-2">
          <MarkdownAnswer text={entry.answer} />
        </div>
        {entry.answerTruncated ? (
          <p className="mt-2 text-sm text-neutral-500">The stored answer is longer than the portion shown here.</p>
        ) : null}
      </div>
      <div className="mt-4">
        <h3 className="text-sm font-medium">Metadata</h3>
        {metadata.length === 0 ? (
          <p className="mt-2 text-sm text-neutral-500">None stored.</p>
        ) : (
          <dl className="mt-2 flex flex-col gap-1 text-sm">
            {metadata.map(([key, value]) => (
              <div key={key} className="flex gap-2">
                <dt className="font-medium text-neutral-700">{key}</dt>
                <dd className="break-words text-neutral-600">{value}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </article>
  );
}

function entryKey(entry: CacheEntry): string {
  return `${entry.type}:${entry.id}`;
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-neutral-500">{label}</dt>
      <dd className="mt-1 break-words text-neutral-900">{value && value.trim().length > 0 ? value : "Not stored"}</dd>
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

