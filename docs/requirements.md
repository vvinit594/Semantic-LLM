# Requirements

Status: frozen for the MVP. Changes after this point should be recorded in `docs/decisions.md`.

## Product

A semantic caching middleware and API for LLM applications. It decides whether a new user question can safely reuse a previous LLM response by comparing meaning, not exact text.

The system must raise the cache-hit rate as high as correctness allows, and keep a cache hit dramatically cheaper than an LLM call.

## Final request flow

```
USER
  → Frontend
  → API Server
  → Query normalization
  → Local embedding model
  → Redis semantic cache (candidate search)
  → Similarity + safety guards
       HIT  → cached answer
       MISS → LLM → store response
  → RESPONSE
```

## Functional requirements

1. A user sends a question.
2. The system generates an embedding for that question.
3. The system searches the semantic cache.
4. The system finds similar previous questions.
5. The system decides whether a cached response is reusable.
6. On HIT, the system returns the cached response and does not call the LLM.
7. On MISS, the system calls the LLM.
8. On MISS, the system stores the new response in the cache with its embedding and metadata.
9. Cache entries support TTL.
10. The system tracks cache hits and misses.
11. The system tracks latency.
12. The system tracks LLM calls avoided.
13. The system tracks estimated cost.
14. The system supports cache invalidation.

## Non-functional requirements

### Goal A — Cheap HIT

A cache hit must be much cheaper than a full LLM request.

Target:

```
LLM request cost
----------------  >= 100
Cache HIT cost
```

This ratio is measured. It is not a hard-coded claim. If the measured ratio is below 100 under real deployment and pricing assumptions, we investigate the cause instead of reporting a made-up number.

The HIT path is local embedding, Redis, and a response. No LLM call, and no paid embedding API, on the HIT path.

### Goal B — High useful hit rate

```
Cache Hits
---------- × 100
Total Requests
```

The hit rate should be as high as possible without sacrificing correctness. A false hit (reusing an answer that does not apply) is worse than a miss.

## The three questions every decision must answer

1. Can we reuse the answer safely? Semantic similarity plus context validation equals a correct HIT.
2. Can we make a HIT extremely cheap? Local embedding plus Redis plus no LLM equals a very low HIT cost.
3. Can we make a HIT happen frequently? Semantic matching, query normalization, threshold tuning, and a sound cache strategy equal a high useful hit rate.

The product is an intelligent decision layer that replaces an expensive LLM computation with a cheap, semantically equivalent cached response, and proves the economic benefit with benchmarks.

## Cache decision rules (MVP)

A candidate may be returned as a HIT only when all of the following pass:

- Similarity is at or above the configured threshold.
- Metadata is compatible (model version, language, cache scope).
- The entry is still fresh (TTL).
- Safety guards do not reject the pair.

Safety guards required for the MVP:

| Guard | Rule |
| --- | --- |
| Entity mismatch | Different important entities (for example India vs China) must not reuse an answer. |
| Numbers | Different numbers (for example 2+2 vs 2+3) must not reuse an answer. |
| Time-sensitive queries | Queries about today, latest, current, now, price, weather, news, or stock either bypass the cache or use a very short TTL. |
| Model version | Do not reuse an answer from an incompatible model version. |
| Language | Store language and do not mix languages incorrectly. |
| Cache scope | Support tenant, user, and application scope so private data cannot leak. The MVP uses a single public cache scope. |

## What we measure

For evaluation and the dashboard:

- Total requests, hits, misses, hit rate
- LLM calls and LLM calls avoided
- Embedding time, Redis search time, LLM time, total request time
- Average HIT latency and average MISS latency
- Embedding cost, Redis cost, LLM input cost, LLM output cost
- Cache-hit cost, LLM-request cost, and cost ratio
- Valid hits, invalid hits, false hits, and false misses

## Correctness over raw hit rate

Thresholds will be measured, not assumed. Candidate thresholds: 0.80, 0.85, 0.88, 0.90, 0.92, 0.95.

For each threshold we record hit rate, correct hit rate, false hit rate, miss rate, and latency. The chosen threshold is the one that maximizes useful reuse while preserving correctness.

## Failure behavior

The cache must not take the application down.

- If Redis is unavailable, skip the cache, call the LLM, and return the response.
- If the embedding model fails, fall back to an LLM request.

## Out of scope for the first local MVP

These are required later, not in the first coding phase:

- Production deployment (Vercel, Railway/Render, Redis Cloud)
- Multi-tenant cache isolation beyond the data model
- Load tests at 10,000 requests
- The recruiter demo script

## Working agreement

Build one phase at a time. After each phase: run it, review it, and the project owner commits it. The assistant does not commit.
