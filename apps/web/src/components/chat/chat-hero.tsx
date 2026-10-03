import { Button } from "@/components/ui/button";

export function ChatHero({ onClear }: { onClear?: () => void }) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-[1.65rem] leading-tight font-semibold tracking-tight text-ink sm:text-[1.75rem]">
          Ask anything. Reuse intelligence.
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-secondary">
          SemanticCache finds safe, semantically similar answers before calling the LLM.
        </p>
      </div>
      {onClear ? (
        <Button type="button" variant="secondary" className="shrink-0" onClick={onClear}>
          Clear Chat
        </Button>
      ) : null}
    </header>
  );
}
