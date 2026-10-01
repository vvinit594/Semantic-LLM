# Semantic LLM Cache

Semantic caching middleware for LLM applications. A new question can reuse a previous answer when the meaning matches and the safety checks pass. A cache hit must stay far cheaper than an LLM call.

Phase 03 runs Redis Stack locally. Embeddings, the Gemini client, and the chat UI are later phases. See `docs/requirements.md` and `docs/architecture.md`.

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

Put your Gemini key in `.env` as `GEMINI_API_KEY`. That file is gitignored. The key is not read by any code yet. `REDIS_URL` defaults to `redis://localhost:6379` when the API starts.

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
| `pnpm dev:api` | Fastify on `http://127.0.0.1:3001`. `GET /health` includes Redis status. |
| `pnpm dev:web` | Next.js on `http://127.0.0.1:3000`. Placeholder home page only. |
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

`packages/cache` opens the Redis connection. Exact cache storage starts in Phase 05. `packages/embeddings`, `packages/llm`, and `packages/evaluation` still compile only.
