import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";

const components: Components = {
  h1: ({ children }) => (
    <h1 className="mt-5 text-xl font-semibold tracking-tight first:mt-0">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="mt-5 text-lg font-semibold tracking-tight first:mt-0">{children}</h2>
  ),
  h3: ({ children }) => <h3 className="mt-4 text-base font-semibold first:mt-0">{children}</h3>,
  h4: ({ children }) => <h4 className="mt-4 text-base font-semibold first:mt-0">{children}</h4>,
  h5: ({ children }) => <h5 className="mt-3 text-sm font-semibold first:mt-0">{children}</h5>,
  h6: ({ children }) => <h6 className="mt-3 text-sm font-semibold first:mt-0">{children}</h6>,
  p: ({ children }) => <p className="mt-3 break-words leading-7 first:mt-0">{children}</p>,
  ul: ({ children }) => <ul className="mt-3 list-disc space-y-1 pl-5 first:mt-0">{children}</ul>,
  ol: ({ children }) => <ol className="mt-3 list-decimal space-y-1 pl-5 first:mt-0">{children}</ol>,
  li: ({ children }) => <li className="leading-7">{children}</li>,
  hr: () => <hr className="my-4 border-neutral-300" />,
  a: ({ href, children }) => (
    <a href={href} className="font-medium underline underline-offset-2">
      {children}
    </a>
  ),
  blockquote: ({ children }) => (
    <blockquote className="mt-3 border-l-2 border-neutral-300 pl-3 text-neutral-700 first:mt-0">
      {children}
    </blockquote>
  ),
  pre: ({ children }) => (
    <pre className="mt-3 max-w-full overflow-x-auto rounded-md border border-neutral-200 bg-white p-3 font-mono text-sm leading-6 first:mt-0">
      {children}
    </pre>
  ),
  code: ({ className, children }) => <code className={className}>{children}</code>,
};

export function MarkdownAnswer({ text }: { text: string }) {
  return (
    <div className="answer-markdown mt-2 min-w-0 text-base text-neutral-900">
      <ReactMarkdown remarkPlugins={[remarkBreaks]} components={components} skipHtml>
        {text}
      </ReactMarkdown>
    </div>
  );
}
