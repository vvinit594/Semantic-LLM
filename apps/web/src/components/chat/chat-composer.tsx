import type { FormEvent, KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";

export function ChatComposer({
  value,
  sending,
  tooLong,
  onChange,
  onSubmit,
}: {
  value: string;
  sending: boolean;
  tooLong: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
}) {
  const trimmed = value.trim();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit();
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      onSubmit();
    }
  }

  return (
    <form onSubmit={submit} className="shrink-0 border-t border-line bg-canvas px-4 py-4 sm:px-6">
      <div className="mx-auto w-full max-w-3xl">
        <label htmlFor="question" className="sr-only">
          Question
        </label>
        <div className="rounded-card border border-line-strong bg-surface p-3 shadow-card transition-[border-color,box-shadow] duration-150 focus-within:border-accent focus-within:shadow-card">
          <textarea
            id="question"
            name="question"
            rows={3}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Ask SemanticCache anything..."
            className="max-h-48 min-h-24 w-full resize-none bg-transparent text-base leading-7 text-ink outline-none placeholder:text-faint"
          />
          <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-faint" role="status">
              {tooLong ? "Keep the question under 8000 characters." : "Enter to send · Shift + Enter for a new line"}
            </p>
            <Button
              type="submit"
              aria-label={sending ? "Sending question" : "Send question"}
              disabled={!trimmed || tooLong || sending}
              className="w-full active:translate-y-px sm:w-auto"
            >
              {sending ? "Sending…" : "Send"}
            </Button>
          </div>
        </div>
      </div>
    </form>
  );
}
