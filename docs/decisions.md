# Decisions

## 2026-10-01 — Package manager

Use pnpm 10 workspaces. The version is pinned in the root `packageManager` field (`pnpm@10.20.0`).

## 2026-10-01 — First LLM provider

Gemini is the first concrete provider. The API will read `GEMINI_API_KEY` from the server environment. The key is never committed and never sent to the frontend.

Phase 04 calls Gemini through `LLMProvider` in `packages/llm`. The default model is `gemini-3.8-flash`, overridable with `GEMINI_MODEL`. `POST /api/chat` does not read or write the cache. The cache package does not import the Gemini SDK.

## 2026-10-01 — Local Redis

Redis Stack server `redis/redis-stack-server:7.4.0-v8`, started with Docker Compose and published on `localhost:6379`. This is the last Redis Stack patch and it includes RediSearch, which later phases use for vector search. The API uses the `redis` Node client from `packages/cache` and reads `REDIS_URL`. If Redis is down, the API still starts and `GET /health` reports `redis: "error"`.

## 2026-10-01 — TypeScript

TypeScript 5.9. The Next.js 16 app scaffold depends on `typescript` ^5, and the API and packages use the same major line so one `pnpm typecheck` covers the repo. Packages export TypeScript source and the API runs through `tsx`. A production JS build is left for deployment.
