# Semantic LLM Cache

Semantic caching middleware for LLM applications. A new question can reuse a previous answer when the meaning matches and the safety checks pass. A cache hit must stay far cheaper than an LLM call.

The API container for Vercel is `Dockerfile.vercel`. It keeps the local embedding model, Redis external, and the Gemini key on the server. See `docs/deployment.md`. Chat still calls `POST /api/chat`. The API key stays on the server.

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
| `pnpm dev:web` | Next.js chat on `http://127.0.0.1:3000`. |
| `pnpm test` | Dataset validation, benchmark report checks, cost quotes, normalization, hit-rate probes, safety-guard, decision-engine, cache, and embedding checks. |
| `pnpm evaluate` | Run the labeled dataset and write the hit-rate, latency, and cost report. |
| `pnpm load` | Load-test the API. Safe mode is the default and does not call Gemini. See `docs/load-testing.md`. |
| `docker build -f deploy/api.Dockerfile` | Build the long-running API image. It does not deploy. See `docs/deployment.md`. |
| `docker build -f Dockerfile.vercel` | Build the Vercel API container. It does not deploy. See `docs/deployment.md`. |
| `pnpm typecheck` | Typecheck every workspace package. |
| `pnpm lint` | Lint the web app. |
| `pnpm build:web` | Production build of the web app. |

## Layout

```
apps/web          Next.js frontend
apps/api          Fastify backend
packages/shared   Shared constants
packages/query      Query normalization
packages/embeddings
packages/cache
packages/decision
packages/llm
packages/evaluation
datasets/          Labeled evaluation queries
```

`packages/query` normalizes case, spacing, and punctuation without rewriting the question. `packages/embeddings` turns text into local 384-dimension vectors. `packages/cache` stores exact entries and vector records. `packages/decision` decides HIT or MISS from similarity, metadata, freshness, and safety guards. `packages/evaluation` loads `datasets/test-queries.json`, measures a small hit-rate probe, prices a cache hit against an LLM request, and runs `pnpm evaluate`. `packages/llm` is the Gemini provider.
