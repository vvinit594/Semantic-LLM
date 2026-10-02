import Link from "next/link";

export function SiteHeader({
  current,
  description,
  wide = false,
}: {
  current: "chat" | "dashboard" | "cache";
  description: string;
  wide?: boolean;
}) {
  return (
    <header className="border-b border-neutral-200 px-6 py-5">
      <div className={`mx-auto flex w-full items-start justify-between gap-4 ${wide ? "max-w-5xl" : "max-w-2xl"}`}>
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Semantic LLM Cache</h1>
          <p className="mt-1 text-sm text-neutral-600">{description}</p>
        </div>
        <nav className="flex shrink-0 flex-wrap justify-end gap-x-4 gap-y-1 pt-1 text-sm">
          <Link href="/" className={current === "chat" ? "font-medium" : "text-neutral-600"}>
            Chat
          </Link>
          <Link href="/dashboard" className={current === "dashboard" ? "font-medium" : "text-neutral-600"}>
            Dashboard
          </Link>
          <Link href="/cache" className={current === "cache" ? "font-medium" : "text-neutral-600"}>
            Cache
          </Link>
        </nav>
      </div>
    </header>
  );
}
