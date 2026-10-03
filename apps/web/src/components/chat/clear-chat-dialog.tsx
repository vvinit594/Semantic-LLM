"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export function ClearChatDialog({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) {
  useEffect(() => {
    document.getElementById("clear-chat-cancel")?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onCancel();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-ink/40 px-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onCancel();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="clear-chat-title"
        aria-describedby="clear-chat-description"
        className="w-full max-w-sm rounded-card border border-line bg-surface p-5 shadow-card"
      >
        <h2 id="clear-chat-title" className="text-base font-semibold text-ink">
          Clear this conversation?
        </h2>
        <p id="clear-chat-description" className="mt-2 text-sm leading-6 text-secondary">
          This will remove all messages from this session.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button id="clear-chat-cancel" type="button" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" onClick={onConfirm}>
            Clear Chat
          </Button>
        </div>
      </div>
    </div>
  );
}
