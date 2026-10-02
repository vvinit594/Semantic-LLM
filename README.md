# Semantic LLM Cache

Semantic caching middleware for LLM applications. A new question can reuse a previous answer when the meaning matches and the safety checks pass. A cache hit must stay far cheaper than an LLM call.

Phase 11 rejects a similar answer when the entities or numbers differ, and it does not cache questions about the latest or current news, price, weather, or stock. The chat UI is a later phase. See `docs/requirements.md` and `docs/architecture.md`.

## Prerequisites

- Node.js 20 or newer
- pnpm 10.20.0 (`corepack enable` then `corepack prepare pnpm@10.20.0 --activate` if `pnpm` is not on your PATH)
- Docker Desktop, running, for Redis Stack

## Setup

```bash
pnpm install
cp .env.example .env
```

On Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

`.env` is gitignored. Paste your Gemini key there as `GEMINI_API_KEY`. Do not put the key in `.env.example`. `REDIS_URL` defaults to `redis://localhost:6379` when the API starts.

Start Redis before the API:

```powershell
pnpm redis:up
pnpm dev:api
```

`GET http://127.0.0.1:3001/health` returns `redis: "ok"` when the connection succeeds. If Redis is down, the API still serves and reports `redis: "error"`.

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm redis:up` | Start Redis Stack in Docker. |
| `pnpm redis:down` | Stop Redis Stack and keep the data volume. |
| `pnpm dev:api` | Fastify on `http://127.0.0.1:3001`. `POST /api/chat` uses the exact cache, then semantic search, then Gemini on a miss. |
| `pnpm dev:web` | Next.js on `http://127.0.0.1:3000`. Placeholder home page only. |
| `pnpm test` | Safety-guard, decision-engine, exact-cache, semantic HIT/MISS, vector search, metrics, and local embedding checks. |
| `pnpm typecheck` | Typecheck every workspace package. |
| `pnpm lint` | Lint the web app. |
| `pnpm build:web` | Production build of the web app. |

## Layout

```
apps/web          Next.js frontend
apps/api          Fastify backend
packages/shared   Shared constants
packages/embeddings
packages/cache
packages/decision
packages/llm
packages/evaluation
```

`packages/embeddings` turns text into local 384-dimension vectors. `packages/cache` stores exact entries and vector records. `packages/decision` decides HIT or MISS from similarity, metadata, freshness, and safety guards. `packages/llm` is the Gemini provider. `packages/evaluation` still compiles only.
