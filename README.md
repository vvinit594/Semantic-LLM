# Semantic LLM Cache

Semantic caching middleware for LLM applications. A new question can reuse a previous answer when the meaning matches and the safety checks pass. A cache hit must stay far cheaper than an LLM call.

Phase 06 records exact-cache metrics. `GET /api/metrics` reports requests, hits, misses, hit rate, LLM calls, calls avoided, and latency. Embeddings and the chat UI are later phases. See `docs/requirements.md` and `docs/architecture.md`.

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
| `pnpm dev:api` | Fastify on `http://127.0.0.1:3001`. `POST /api/chat` uses the exact Redis cache, then Gemini on a miss. |
| `pnpm dev:web` | Next.js on `http://127.0.0.1:3000`. Placeholder home page only. |
| `pnpm test` | Exact-cache and metrics checks. |
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
packages/llm
packages/evaluation
```

`packages/cache` stores exact question-and-answer entries. Semantic search is later. `packages/llm` is the Gemini provider. `packages/embeddings` and `packages/evaluation` still compile only.
