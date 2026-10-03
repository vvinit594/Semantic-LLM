"use client";

import { useState, type FormEvent, type KeyboardEvent } from "react";
import { chatResult, type ChatReply } from "../api-responses";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { FieldLabel, TextArea } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { MarkdownAnswer } from "./markdown-answer";

const MAX_MESSAGE_LENGTH = 8_000;

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
    <div className="flex flex-1 flex-col">
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-4 py-8 sm:px-6">
        <PageHeader
          title="Chat"
          subtitle="Ask a question. An identical or similar question can reuse a cached answer."
        />
        {turns.length === 0 ? (
          <EmptyState
            title="No questions yet"
            detail="Exact matches skip the model. Similar questions can reuse an answer when the safety checks pass."
          />
        ) : (
          <ol className="flex flex-col gap-6">
            {turns.map((turn) => (
              <li key={turn.id} className="flex flex-col gap-3">
                <p className="text-xs font-medium tracking-wide text-faint uppercase">You</p>
                <p className="text-base leading-7 whitespace-pre-wrap text-ink">{turn.question}</p>
                <Answer turn={turn} />
              </li>
            ))}
          </ol>
        )}
      </div>

      <form onSubmit={onSubmit} className="sticky bottom-0 border-t border-line bg-canvas px-4 py-4 sm:px-6">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-3">
          <FieldLabel htmlFor="question">Question</FieldLabel>
          <TextArea
            id="question"
            name="question"
            rows={3}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder="What is the capital of France?"
          />
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-secondary" role="status">
              {tooLong ? "Keep the question under 8000 characters." : "Enter sends. Shift+Enter adds a line."}
            </p>
            <Button type="submit" disabled={!trimmed || tooLong || sending}>
              {sending ? "Sending…" : "Send"}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}

function Answer({ turn }: { turn: Turn }) {
  if (turn.pending) {
    return (
      <p className="text-sm text-secondary" role="status">
        Checking the cache…
      </p>
    );
  }
  if (turn.error) {
    return <ErrorState>{turn.error}</ErrorState>;
  }
  if (!turn.reply) {
    return null;
  }
  const { reply } = turn;
  return (
    <Card className="min-w-0">
      <p className="text-xs font-medium tracking-wide text-faint uppercase">Answer</p>
      <MarkdownAnswer text={reply.answer} />
      <dl className="mt-4 flex flex-col gap-2 text-sm text-secondary">
        <div className="flex flex-wrap items-center gap-2">
          <dt className="sr-only">Cache result</dt>
          <dd className="flex flex-wrap items-center gap-2">
            <Badge tone={reply.cached ? "success" : "warning"}>{reply.cached ? "HIT" : "MISS"}</Badge>
            <span>{reply.cached ? "Cached answer" : "Answered by the model"}</span>
          </dd>
        </div>
        {reply.cached ? (
          <>
            <div className="flex gap-2">
              <dt className="text-faint">Similarity</dt>
              <dd className="text-ink">{formatSimilarity(reply)}</dd>
            </div>
            {reply.matchedQuery ? (
              <div className="flex gap-2">
                <dt className="shrink-0 text-faint">Matched query</dt>
                <dd className="text-ink">{reply.matchedQuery}</dd>
              </div>
            ) : null}
          </>
        ) : null}
      </dl>
    </Card>
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
  const result = chatResult(response.ok, body);
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.reply;
}
