"use client";

import { useState } from "react";
import { chatResult, type ChatReply } from "../api-responses";
import { AnswerCard } from "@/components/chat/answer-card";
import { ChatComposer } from "@/components/chat/chat-composer";
import { ChatEmpty } from "@/components/chat/chat-empty";
import { ChatHero } from "@/components/chat/chat-hero";
import { SearchingState } from "@/components/chat/searching-state";
import { ErrorState } from "@/components/ui/error-state";

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
  const tooLong = draft.trim().length > MAX_MESSAGE_LENGTH;

  async function submit(raw: string) {
    const question = raw.trim();
    if (!question || question.length > MAX_MESSAGE_LENGTH || sending) {
      return;
    }
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

  return (
    <div className="flex h-[calc(100dvh-4rem)] min-h-0 flex-col">
      <div className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col gap-6 overflow-y-auto px-4 py-8 sm:px-6">
        <ChatHero />
        {turns.length === 0 ? (
          <ChatEmpty disabled={sending} onAsk={(question) => void submit(question)} />
        ) : (
          <ol className="flex flex-col gap-8">
            {turns.map((turn) => (
              <li key={turn.id} className="chat-in flex min-w-0 flex-col gap-3">
                <p className="text-xs font-medium tracking-wide text-faint uppercase">You</p>
                <p className="text-base leading-7 break-words whitespace-pre-wrap text-ink">{turn.question}</p>
                <Answer turn={turn} />
              </li>
            ))}
          </ol>
        )}
      </div>
      <ChatComposer
        value={draft}
        sending={sending}
        tooLong={tooLong}
        onChange={setDraft}
        onSubmit={() => void submit(draft)}
      />
    </div>
  );
}

function Answer({ turn }: { turn: Turn }) {
  if (turn.pending) {
    return <SearchingState />;
  }
  if (turn.error) {
    return <ErrorState>{turn.error}</ErrorState>;
  }
  if (!turn.reply) {
    return null;
  }
  return <AnswerCard reply={turn.reply} />;
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
