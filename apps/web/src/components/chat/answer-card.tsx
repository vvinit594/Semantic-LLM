import type { ChatReply } from "@/api-responses";
import { MarkdownAnswer } from "@/app/markdown-answer";
import { CacheStatus } from "./cache-status";

export function AnswerCard({ reply }: { reply: ChatReply }) {
  return (
    <article className="chat-in min-w-0 rounded-card border border-line bg-surface p-4 shadow-card">
      <p className="text-xs font-medium tracking-wide text-faint uppercase">SemanticCache</p>
      <h2 className="mt-1 text-sm font-medium text-ink">Answer</h2>
      <div className="mt-3">
        <CacheStatus reply={reply} />
      </div>
      <div className="mt-4 max-w-full overflow-hidden">
        <MarkdownAnswer text={reply.answer} />
      </div>
    </article>
  );
}
