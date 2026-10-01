import { PROJECT_NAME } from "@semantic-llm/shared";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-4 px-6">
      <p className="text-sm font-medium tracking-wide text-neutral-500">Phase 02</p>
      <h1 className="text-4xl font-semibold tracking-tight">{PROJECT_NAME}</h1>
      <p className="max-w-xl text-lg text-neutral-600">
        The monorepo skeleton is ready. Chat, caching, and the dashboard come in later phases.
      </p>
    </main>
  );
}
