"use client";

import { useState, type FormEvent, type KeyboardEvent } from "react";

const MAX_MESSAGE_LENGTH = 8_000;

type ChatMatch = "exact" | "semantic" | null;

type ChatReply = {
  answer: string;
  cached: boolean;
  match: ChatMatch;
  similarity: number | null;
  matchedQuery: string | null;
};

type Turn = {
  id: string;
  question: string;
  pending: boolean;
  reply?: ChatReply;
  error?: string;
};

export function Chat({ apiUrl }: { apiUrl: string }) {
  const [draft, setDraft] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [sending, setSending] = useState(false);
  const trimmed = draft.trim();
  const tooLong = trimmed.length > MAX_MESSAGE_LENGTH;

  async function send() {
    if (!trimmed || tooLong || sending) {
      return;
    }
    const question = trimmed;
    const id = crypto.randomUUID();
    setDraft("");
    setSending(true);
    setTurns((current) => [...current, { id, question, pending: true }]);
    try {
      const reply = await requestAnswer(apiUrl, question);
      setTurns((current) => current.map((turn) => (turn.id === id ? { ...turn, pending: false, reply } : turn)));
    } catch (error) {
      const message = error instanceof Error ? error.message : "The request failed.";
      setTurns((current) => current.map((turn) => (turn.id === id ? { ...turn, pending: false, error: message } : turn)));
    } finally {
      setSending(false);
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void send();
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void send();
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-neutral-200 px-6 py-5">
        <div className="mx-auto w-full max-w-2xl">
          <h1 className="text-lg font-semibold tracking-tight">Semantic LLM Cache</h1>
          <p className="mt-1 text-sm text-neutral-600">
            Ask a question. An identical or similar question can reuse a cached answer.
          </p>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-6">
        {turns.length === 0 ? (
          <p className="text-sm text-neutral-500">The conversation is empty.</p>
        ) : (
          <ol className="flex flex-col gap-6">
            {turns.map((turn) => (
              <li key={turn.id} className="flex flex-col gap-3">
                <p className="text-sm font-medium text-neutral-500">You</p>
                <p className="whitespace-pre-wrap text-base">{turn.question}</p>
                <Answer turn={turn} />
              </li>
            ))}
          </ol>
        )}
      </div>

      <form onSubmit={onSubmit} className="sticky bottom-0 border-t border-neutral-200 bg-white px-6 py-4">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-2">
          <label htmlFor="question" className="text-sm font-medium">
            Question
          </label>
          <textarea
            id="question"
            name="question"
            rows={3}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder="What is the capital of France?"
            className="w-full resize-none rounded-md border border-neutral-300 px-3 py-2 text-base outline-none focus:border-neutral-900"
          />
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-neutral-500" role="status">
              {tooLong ? "Keep the question under 8000 characters." : "Enter sends. Shift+Enter adds a line."}
            </p>
            <button
              type="submit"
              disabled={!trimmed || tooLong || sending}
              className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:bg-neutral-300"
            >
              {sending ? "Sending…" : "Send"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

function Answer({ turn }: { turn: Turn }) {
  if (turn.pending) {
    return (
      <p className="text-sm text-neutral-500" role="status">
        Checking the cache…
      </p>
    );
  }
  if (turn.error) {
    return (
      <p className="text-sm text-red-700" role="alert">
        {turn.error}
      </p>
    );
  }
  if (!turn.reply) {
    return null;
  }
  const { reply } = turn;
  return (
    <div className="rounded-md border border-neutral-200 bg-neutral-50 px-4 py-3">
      <p className="text-sm font-medium text-neutral-500">Answer</p>
      <p className="mt-2 whitespace-pre-wrap text-base">{reply.answer}</p>
      <dl className="mt-3 flex flex-col gap-1 text-sm text-neutral-600">
        <div className="flex gap-2">
          <dt className="font-medium text-neutral-800">{reply.cached ? "HIT" : "MISS"}</dt>
          <dd>{reply.cached ? "Cached answer" : "Answered by the model"}</dd>
        </div>
        {reply.cached ? (
          <>
            <div className="flex gap-2">
              <dt>Similarity</dt>
              <dd>{formatSimilarity(reply)}</dd>
            </div>
            {reply.matchedQuery ? (
              <div className="flex gap-2">
                <dt className="shrink-0">Matched query</dt>
                <dd>{reply.matchedQuery}</dd>
              </div>
            ) : null}
          </>
        ) : null}
      </dl>
    </div>
  );
}

function formatSimilarity(reply: ChatReply): string {
  if (reply.match === "exact") {
    return "1.000 exact";
  }
  if (typeof reply.similarity === "number" && Number.isFinite(reply.similarity)) {
    return reply.similarity.toFixed(3);
  }
  return "Unavailable";
}

async function requestAnswer(apiUrl: string, message: string): Promise<ChatReply> {
  let response: Response;
  try {
    response = await fetch(`${apiUrl.replace(/\/$/, "")}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    });
  } catch {
    throw new Error("The API is not reachable.");
  }

  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(readError(body) ?? "The request failed.");
  }
  if (!isChatReply(body)) {
    throw new Error("The API returned an unexpected response.");
  }
  return body;
}

function readError(body: unknown): string | undefined {
  if (typeof body !== "object" || body === null || !("error" in body)) {
    return undefined;
  }
  const error = body.error;
  return typeof error === "string" && error.trim().length > 0 ? error : undefined;
}

function isChatReply(body: unknown): body is ChatReply {
  if (typeof body !== "object" || body === null) {
    return false;
  }
  const reply = body as Partial<ChatReply>;
  return (
    typeof reply.answer === "string" &&
    typeof reply.cached === "boolean" &&
    (reply.match === "exact" || reply.match === "semantic" || reply.match === null) &&
    (typeof reply.similarity === "number" || reply.similarity === null) &&
    (typeof reply.matchedQuery === "string" || reply.matchedQuery === null)
  );
}
