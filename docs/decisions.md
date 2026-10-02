# Decisions

## 2026-10-01 — Package manager

Use pnpm 10 workspaces. The version is pinned in the root `packageManager` field (`pnpm@10.20.0`).

## 2026-10-01 — First LLM provider

Gemini is the first concrete provider. The API will read `GEMINI_API_KEY` from the server environment. The key is never committed and never sent to the frontend.

Phase 04 calls Gemini through `LLMProvider` in `packages/llm`. The default model is `gemini-3.8-flash`, overridable with `GEMINI_MODEL`. `POST /api/chat` does not read or write the cache. The cache package does not import the Gemini SDK.

## 2026-10-01 — Exact cache baseline

Identical trimmed questions are stored in Redis under a SHA-256 key that includes the provider and model. The first request is a miss: Gemini answers, then the answer is stored with a 24-hour TTL. The second request is a hit and does not call Gemini. A different string, a different model, or an expired entry is a miss. If Redis is unavailable, the request still calls Gemini.

## 2026-10-02 — Safety guards

Safety guards live in `@semantic-llm/decision` beside `decideCache`. After similarity, metadata, and freshness pass, a neighbor is still a MISS when the questions name different entities, contain different numbers, or either question is time-sensitive. Time-sensitive means the words today, latest, current, now, price, weather, news, or stock. Those questions skip cache reads and writes. Model, language, and scope stay dedicated metadata guards. The chat route calls the guards and does not contain their rules.

## 2026-10-02 — Cache decision engine

HIT and MISS for a semantic neighbor are decided by `decideCache` in `@semantic-llm/decision`. The function is pure: it does not call Redis, the embedding model, or the LLM. It accepts a neighbor when the cosine similarity is at least the threshold, the model, language, and cache scope match, and `expiresAt` is still in the future. It then keeps looking down the ranked neighbors if a nearer one fails metadata or freshness. Entity, number, and time-sensitive guards are not applied. The chat route only supplies the request and stores the result.

## 2026-10-02 — Semantic cache

`POST /api/chat` still checks the exact string cache first. On an exact miss it embeds the trimmed question locally and searches the Redis vector index. The nearest neighbor is a HIT when its cosine similarity is at least `SEMANTIC_SIMILARITY_THRESHOLD` (initially 0.85). Otherwise the request calls the LLM and stores both the exact entry and the vector record. The comparison is similarity only: model, language, scope, and the other safety guards are later phases. Language is stored as `und` until those checks exist. If embedding or Redis fails, the request still calls the LLM.

## 2026-10-01 — Redis vector search

Semantic records are Redis JSON documents under `semantic:`, indexed by `idx:semantic`. The index is an exact FLAT KNN index over the 384-dimension embedding, using cosine distance. Search returns the top K records with cosine similarity. It does not apply a threshold or decide HIT or MISS. The exact string cache remains in place.

## 2026-10-01 — Local embeddings

`EmbeddingService.embed` runs `all-MiniLM-L6-v2` locally through Transformers.js. The ONNX weights are `onnx-community/all-MiniLM-L6-v2-ONNX`, with mean pooling. Every vector has 384 dimensions and is L2-normalized so later cosine similarity is a dot product. Model files stay in `packages/embeddings/.cache` and are not committed. The chat route does not call this service yet.

## 2026-10-01 — Request metrics

Live counters live in `RequestMetrics`, not in the cache. `GET /api/metrics` returns request, hit, miss, hit rate, LLM call, calls avoided, and average latency totals. The snapshot stores numbers only: no question text, answers, or API keys. A metrics failure does not fail the chat response. Counts reset when the API process restarts.

## 2026-10-01 — Local Redis

Redis Stack server `redis/redis-stack-server:7.4.0-v8`, started with Docker Compose and published on `localhost:6379`. This is the last Redis Stack patch and it includes RediSearch, which later phases use for vector search. The API uses the `redis` Node client from `packages/cache` and reads `REDIS_URL`. If Redis is down, the API still starts and `GET /health` reports `redis: "error"`.

## 2026-10-01 — TypeScript

TypeScript 5.9. The Next.js 16 app scaffold depends on `typescript` ^5, and the API and packages use the same major line so one `pnpm typecheck` covers the repo. Packages export TypeScript source and the API runs through `tsx`. A production JS build is left for deployment.
