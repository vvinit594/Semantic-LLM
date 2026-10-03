"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { AnswerCard } from "@/components/chat/answer-card";
import { ChatComposer } from "@/components/chat/chat-composer";
import { ChatEmpty } from "@/components/chat/chat-empty";
import { ChatHero } from "@/components/chat/chat-hero";
import { ClearChatDialog } from "@/components/chat/clear-chat-dialog";
import { useChatSession, type ChatTurn } from "@/components/chat/chat-session";
import { SearchingState } from "@/components/chat/searching-state";
import { ErrorState } from "@/components/ui/error-state";

const MAX_MESSAGE_LENGTH = 8_000;
const COMPOSER_GAP = 16;

export function Chat() {
  const { turns, sending, ready, submit, clear } = useChatSession();
  const [draft, setDraft] = useState("");
  const [confirming, setConfirming] = useState(false);
  const dismissClear = useCallback(() => setConfirming(false), []);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const latestRef = useRef<HTMLLIElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const tooLong = draft.trim().length > MAX_MESSAGE_LENGTH;

  useLayoutEffect(() => {
    if (!ready || turns.length === 0) {
      return;
    }
    scrollLatestIntoView(scrollerRef.current, latestRef.current, endRef.current, false);
    const frame = requestAnimationFrame(() => {
      scrollLatestIntoView(scrollerRef.current, latestRef.current, endRef.current, true);
    });
    return () => cancelAnimationFrame(frame);
  }, [ready, turns]);

  function ask(raw: string) {
    const question = raw.trim();
    if (!question || question.length > MAX_MESSAGE_LENGTH || sending) {
      return;
    }
    setDraft("");
    submit(question);
  }

  return (
    <div className="flex h-[calc(100dvh-4rem)] min-h-0 flex-col">
      <div ref={scrollerRef} className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col gap-6 overflow-y-auto px-4 py-8 sm:px-6">
        <ChatHero onClear={ready && turns.length > 0 ? () => setConfirming(true) : undefined} />
        {ready && turns.length === 0 ? <ChatEmpty disabled={sending} onAsk={ask} /> : null}
        {ready && turns.length > 0 ? (
          <ol className="flex flex-col gap-8">
            {turns.map((turn, index) => (
              <li
                key={turn.id}
                ref={index === turns.length - 1 ? latestRef : undefined}
                className="chat-in flex min-w-0 flex-col gap-3"
              >
                <p className="text-xs font-medium tracking-wide text-faint uppercase">You</p>
                <p className="text-base leading-7 break-words whitespace-pre-wrap text-ink">{turn.question}</p>
                <Answer turn={turn} />
              </li>
            ))}
          </ol>
        ) : null}
        <div ref={endRef} className="h-4 shrink-0" aria-hidden="true" />
      </div>
      <ChatComposer
        value={draft}
        sending={sending}
        tooLong={tooLong}
        onChange={setDraft}
        onSubmit={() => ask(draft)}
      />
      {confirming ? (
        <ClearChatDialog
          onCancel={dismissClear}
          onConfirm={() => {
            clear();
            setDraft("");
            setConfirming(false);
          }}
        />
      ) : null}
    </div>
  );
}

function scrollLatestIntoView(
  scroller: HTMLDivElement | null,
  latest: HTMLLIElement | null,
  end: HTMLDivElement | null,
  instant: boolean,
) {
  if (!scroller || !latest || !end) {
    return;
  }
  const scrollerRect = scroller.getBoundingClientRect();
  const latestRect = latest.getBoundingClientRect();
  const endRect = end.getBoundingClientRect();
  const turnHeight = endRect.bottom - latestRect.top;
  const delta =
    turnHeight + COMPOSER_GAP <= scroller.clientHeight
      ? endRect.bottom - (scrollerRect.bottom - COMPOSER_GAP)
      : latestRect.top - scrollerRect.top;
  if (Math.abs(delta) < 2) {
    return;
  }
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const top = scroller.scrollTop + delta;
  if (!instant && !reduce && Math.abs(delta) <= scroller.clientHeight) {
    scroller.scrollTo({ top, behavior: "smooth" });
    return;
  }
  scroller.scrollTop = top;
}

function Answer({ turn }: { turn: ChatTurn }) {
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
