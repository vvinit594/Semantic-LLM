# Decisions

## 2026-10-02 — Cache explorer

`/cache` reads `GET /api/cache`. The endpoint scans the existing exact and semantic Redis keys and returns the stored question, answer, model, language, scope, timestamps, and metadata. Exact entries do not store language or scope, so those fields stay empty. Embeddings and API keys are not returned. The explorer does not write, delete, or decide hits.

## 2026-10-02 — Analytics dashboard

`/dashboard` reads `GET /api/metrics` and `GET /api/benchmark`. Live counts stay in `RequestMetrics` and still reset when the API process restarts. The benchmark view is the saved `datasets/evaluation-results.json` report, trimmed to summary fields. It does not rerun the benchmark and does not change the production threshold. Exact and semantic hits, miss reasons, hit and miss latency, and estimated savings are recorded from decisions the chat route already made.

## 2026-10-02 — Transient Gemini errors

Gemini HTTP 429 and 503 are transient. `GeminiProvider` tries the request up to three times, waiting 200ms and then 400ms. A missing API key, an empty response, and any other status are not retried. After the retries are exhausted, chat returns 429 or 503 with a short retry message. Other LLM failures stay HTTP 502. A failed provider call does not write the cache.

## 2026-10-02 — Frontend chat

The Next.js page at `apps/web` sends the question to the existing `POST /api/chat` endpoint. The response still includes `answer` and `cached`, and now also includes `match`, `similarity`, and `matchedQuery`. An exact hit reports similarity 1 and the stored question. A semantic hit reports the Redis score and the cached question. A miss leaves those fields null. The browser may call `http://127.0.0.1:3000` and `http://localhost:3000`. `GEMINI_API_KEY` and `REDIS_URL` stay on the API.

## 2026-10-02 — Automated benchmark

`pnpm evaluate` loads `datasets/test-queries.json`, embeds with local MiniLM, stores each cached question in Redis, and decides with `decideCache`. It writes `datasets/evaluation-results.json` and `docs/benchmark.md`. On 2026-10-02, at the production threshold 0.85, the 37 cases had a hit rate of 0.270, no false hits, and one false miss (`learning-paraphrase`, score 0.784). Thresholds 0.80 through 0.90 made the same decisions. The run does not change the production threshold. The LLM is not called. The measured cache-hit to LLM-request cost ratio was 326.

## 2026-10-02 — Evaluation dataset

`datasets/test-queries.json` is the labeled set for cache quality. Each case is a cached question, a new question, an expected hit or miss, and a false-hit or false-miss risk. Categories cover paraphrases, normalization, unrelated questions, entity mismatches, number mismatches, time-sensitive queries, different intent on the same subject, and model, language, or scope mismatches. Validation checks those labels against the safety and metadata guards. It does not embed questions or choose a threshold. The benchmark command is a later phase.

## 2026-10-02 — Cost of a cache hit

A cache hit does not call the LLM and does not call a paid embedding API. An exact hit also skips the local embedding model. Cost inputs are explicit: embedding API price is $0, local CPU is priced at $0.05 per vCPU-hour, and Gemini 3.8 Flash uses the introductory list price of $0.75 / $3.75 per 1M tokens through 2026-12-31. The LLM bill is input and output tokens. Waiting on the API is not billed as local CPU. On 2026-10-02 a warm semantic hit cost $0.000000641 and one Gemini request cost $0.000246, a ratio of 384. A hotter run on the same day reached 3519. See `docs/cost.md`.

## 2026-10-01 — Package manager

Use pnpm 10 workspaces. The version is pinned in the root `packageManager` field (`pnpm@10.20.0`).

## 2026-10-01 — First LLM provider

Gemini is the first concrete provider. The API will read `GEMINI_API_KEY` from the server environment. The key is never committed and never sent to the frontend.

Phase 04 calls Gemini through `LLMProvider` in `packages/llm`. The default model is `gemini-3.8-flash`, overridable with `GEMINI_MODEL`. `POST /api/chat` does not read or write the cache. The cache package does not import the Gemini SDK.

## 2026-10-01 — Exact cache baseline

Identical trimmed questions are stored in Redis under a SHA-256 key that includes the provider and model. The first request is a miss: Gemini answers, then the answer is stored with a 24-hour TTL. The second request is a hit and does not call Gemini. A different string, a different model, or an expired entry is a miss. If Redis is unavailable, the request still calls Gemini.

## 2026-10-02 — Hit-rate normalization

Questions are normalized before the exact cache key and before the embedding: case, repeated whitespace, trailing punctuation, and spaces around `+`. Wording is not rewritten. Safety guards still see the original question, so India versus China and 2+2 versus 2+3 still miss. A pairwise probe of 14 questions is in `packages/evaluation`. On that set, thresholds 0.80 through 0.92 make the same decisions, false hits stay at 0, and 0.85 remains the production threshold. See `docs/hit-rate.md`.

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
