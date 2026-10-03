"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { chatResult, type ChatReply } from "@/api-responses";

const STORAGE_KEY = "semanticcache-chat";
const MAX_MESSAGE_LENGTH = 8_000;
const EMPTY_TURNS: ChatTurn[] = [];

export type ChatTurn = {
  id: string;
  question: string;
  pending: boolean;
  reply?: ChatReply;
  error?: string;
};

type ChatSessionValue = {
  turns: ChatTurn[];
  sending: boolean;
  ready: boolean;
  submit: (raw: string) => void;
  clear: () => void;
};

const listeners = new Set<() => void>();
let turns: ChatTurn[] = EMPTY_TURNS;
let hydrated = false;

function emit() {
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function ensureHydrated() {
  if (hydrated || typeof window === "undefined") {
    return;
  }
  hydrated = true;
  turns = readTurns();
  writeTurns(turns);
}

function getTurns(): ChatTurn[] {
  ensureHydrated();
  return turns;
}

function getServerTurns(): ChatTurn[] {
  return EMPTY_TURNS;
}

function replaceTurns(next: ChatTurn[]) {
  turns = next;
  writeTurns(turns);
  emit();
}

function subscribeReady(): () => void {
  return () => undefined;
}

const ChatSessionContext = createContext<ChatSessionValue | null>(null);

export function ChatSessionProvider({ apiUrl, children }: { apiUrl: string; children: ReactNode }) {
  const sessionTurns = useSyncExternalStore(subscribe, getTurns, getServerTurns);
  const ready = useSyncExternalStore(subscribeReady, () => true, () => false);
  const [sending, setSending] = useState(false);
  const generation = useRef(0);
  const busy = useRef(false);

  const submit = useCallback((raw: string) => {
    const question = raw.trim();
    if (!question || question.length > MAX_MESSAGE_LENGTH || busy.current) {
      return;
    }
    const gen = generation.current;
    const id = crypto.randomUUID();
    busy.current = true;
    setSending(true);
    replaceTurns([...getTurns(), { id, question, pending: true }]);
    void requestAnswer(apiUrl, question)
      .then((reply) => {
        if (generation.current !== gen) {
          return;
        }
        replaceTurns(getTurns().map((turn) => (turn.id === id ? { ...turn, pending: false, reply } : turn)));
      })
      .catch((error: unknown) => {
        if (generation.current !== gen) {
          return;
        }
        const message = error instanceof Error ? error.message : "The request failed.";
        replaceTurns(getTurns().map((turn) => (turn.id === id ? { ...turn, pending: false, error: message } : turn)));
      })
      .finally(() => {
        if (generation.current === gen) {
          busy.current = false;
          setSending(false);
        }
      });
  }, [apiUrl]);

  const clear = useCallback(() => {
    generation.current += 1;
    busy.current = false;
    setSending(false);
    replaceTurns([]);
  }, []);

  const value = useMemo(
    () => ({ turns: sessionTurns, sending, ready, submit, clear }),
    [sessionTurns, sending, ready, submit, clear],
  );

  return <ChatSessionContext.Provider value={value}>{children}</ChatSessionContext.Provider>;
}

export function useChatSession(): ChatSessionValue {
  const value = useContext(ChatSessionContext);
  if (!value) {
    throw new Error("Chat session is unavailable.");
  }
  return value;
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

function readTurns(): ChatTurn[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.flatMap((item) => {
      const turn = parseTurn(item);
      return turn ? [turn] : [];
    });
  } catch {
    return [];
  }
}

function parseTurn(item: unknown): ChatTurn | null {
  if (typeof item !== "object" || item === null) {
    return null;
  }
  const record = item as Record<string, unknown>;
  if (typeof record.id !== "string" || typeof record.question !== "string") {
    return null;
  }
  if (record.reply !== undefined && !isReply(record.reply)) {
    return null;
  }
  if (record.error !== undefined && typeof record.error !== "string") {
    return null;
  }
  const interrupted = record.pending === true;
  return {
    id: record.id,
    question: record.question,
    pending: false,
    reply: isReply(record.reply) ? record.reply : undefined,
    error: interrupted ? (typeof record.error === "string" ? record.error : "The request was interrupted.") : (typeof record.error === "string" ? record.error : undefined),
  };
}

function isReply(value: unknown): value is ChatReply {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const reply = value as Record<string, unknown>;
  return (
    typeof reply.answer === "string" &&
    typeof reply.cached === "boolean" &&
    (reply.match === "exact" || reply.match === "semantic" || reply.match === null) &&
    (typeof reply.similarity === "number" || reply.similarity === null) &&
    (typeof reply.matchedQuery === "string" || reply.matchedQuery === null)
  );
}

function writeTurns(next: readonly ChatTurn[]) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // The conversation remains in memory for this view.
  }
}
