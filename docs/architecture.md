# Architecture

Status: target architecture for the MVP. Implementation follows the development sequence in this document. Each phase is built, reviewed, and committed by the project owner before the next phase starts.

## System context

```
                    ┌──────────────────────┐
                    │      Next.js         │
                    │   Chat + Dashboard   │
                    └──────────┬───────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │    Node.js API       │
                    │      TypeScript      │
                    └──────────┬───────────┘
                               │
             ┌─────────────────┼──────────────────┐
             │                 │                  │
             ▼                 ▼                  ▼
       Query Engine      Embedding Engine     LLM Provider
             │                 │                  │
             │                 ▼                  │
             │          Local Embedding           │
             │                 │                  │
             └─────────────────┼──────────────────┘
                               ▼
                    ┌──────────────────────┐
                    │    Redis Stack       │
                    │  Vector Search       │
                    │  Cache + Metadata    │
                    │  TTL                 │
                    └──────────┬───────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │  Evaluation Engine   │
                    │  Hit rate, cost,     │
                    │  latency, correctness│
                    └──────────────────────┘
```

## Technology choices

These are the stack decisions for this project. Later changes go in `docs/decisions.md`.

| Layer | Choice | Why |
| --- | --- | --- |
| Frontend | Next.js, TypeScript, Tailwind CSS | Chat, metrics, cache explorer, and admin controls in one app. Built only after the API is stable. |
| API | Node.js, TypeScript, Fastify | The backend is an API and middleware service. Fastify fits that better than a general web framework. |
| Semantic cache | Redis Stack with Redis Vector Search | Stores embeddings, responses, metadata, and TTL, and supports KNN candidate search. |
| Embeddings | Local `all-MiniLM-L6-v2` via Transformers.js | A paid embedding API on every query would destroy the cheap-HIT goal. |
| LLM | `LLMProvider` interface | OpenAI, Gemini, OpenRouter, and others plug in without rewriting the cache. |
| Local infra | Docker, Redis Stack, Node.js, Next.js | Redis must work locally before any AI code. |
| Later deploy | Vercel + Redis Cloud + a Node host | Not part of the local MVP. |

Package manager (pnpm or npm) is chosen in Phase 02, when the repo is initialized.

The first concrete LLM provider is chosen in Phase 04, when `POST /api/chat` is built. The interface exists so that choice does not leak into the cache.

## Monorepo layout

The repo root is this folder (`semantic-llm`). Internal layout:

```
semantic-llm/
├── apps/
│   ├── web/                 Next.js frontend
│   └── api/                 Fastify backend
├── packages/
│   ├── embeddings/          EmbeddingService
│   ├── cache/               Redis semantic cache
│   ├── llm/                 LLM providers
│   ├── evaluation/          Benchmark runner
│   └── shared/              Types and constants
├── datasets/
│   ├── test-queries.json
│   └── evaluation-results.json
├── docs/
│   ├── requirements.md
│   ├── architecture.md
│   ├── algorithm.md
│   ├── benchmarking.md
│   └── decisions.md
├── docker/
│   └── redis/
├── docker-compose.yml
├── package.json
├── README.md
└── .env.example
```

Phase 01 only adds `docs/requirements.md` and `docs/architecture.md`. The rest of the tree appears in the phase that needs it.

## Runtime paths

### HIT

```
User → API → normalize query → local embedding → Redis KNN
     → similarity + guards pass → cached answer
```

No LLM. No external embedding API.

### MISS

```
User → API → normalize query → local embedding → Redis KNN
     → no safe candidate → LLM → store embedding + response + metadata → answer
```

The expensive call happens only on MISS.

### Degraded

```
Redis down        → skip cache → LLM → answer
Embedding failure → skip semantic match → LLM → answer
```

## Cache record

Each cached item is a vector plus metadata, not a plain string key.

| Field | Role |
| --- | --- |
| Query | Original normalized question |
| Embedding | Fixed-dimension vector from the local model |
| Response | LLM answer to reuse |
| Model | Provider and model version |
| Language | So languages are not mixed |
| CreatedAt | Freshness and explorer display |
| ExpiresAt | TTL |
| Metadata | Scope and anything guards need (entities, numbers, time-sensitivity) |

Search returns top-K candidates with similarity scores. The decision engine, not the controller, chooses HIT or MISS.

## Modules and boundaries

| Module | Responsibility | Must not |
| --- | --- | --- |
| API (`apps/api`) | HTTP, validation, rate limits, orchestration | Embed decision rules or provider SDK calls inline |
| Query engine | Normalize text without rewriting meaning | Aggressively paraphrase user content |
| Embedding engine | `embed(text)` → number[] | Call a paid embedding API in the MVP |
| Cache | Index, KNN search, get, set, TTL, invalidate | Decide whether a candidate is safe |
| Cache decision engine | Similarity, metadata, freshness, guards → HIT or MISS | Live inside the route handler |
| LLM provider | Complete a prompt | Know about Redis or embeddings |
| Evaluation | Dataset runner, latency, cost, correctness report | Change production thresholds by itself |
| Web | Chat, analytics, cache explorer, admin controls | Hold `LLM_API_KEY` or `REDIS_URL` |

## Decision engine

```
New query
  → embedding
  → vector search
  → candidate found?
       no  → MISS
       yes → similarity check
               no  → MISS
               yes → metadata check (model, language, scope)
                       no  → MISS
                       yes → freshness check
                               no  → MISS
                               yes → safety guards
                                       no  → MISS
                                       yes → HIT
```

Guards live beside the engine: entity mismatch, number mismatch, time-sensitive queries, model version, language, and cache scope. The MVP scope is a single public cache.

## Build sequence

One phase at a time. Do not start the next phase until the current one has been run, reviewed, and committed by the project owner.

| Phase | Deliverable | Done when |
| --- | --- | --- |
| 01 | Requirements + architecture | These two docs exist and are accepted |
| 02 | Project initialization | Monorepo skeleton, TypeScript, package manager, README, `.env.example` |
| 03 | Docker + Redis | Redis Stack on localhost, connection check succeeds |
| 04 | Basic LLM API | `POST /api/chat` returns an LLM answer with `cached: false`. No cache yet |
| 05 | Exact cache | Identical question is MISS then HIT |
| 06 | Metrics | Hits, misses, LLM calls, latency recorded and readable |
| 07 | Local embedding service | `embed(text)` returns a fixed-dimension vector |
| 08 | Redis vector search | Entries stored as vectors; KNN returns top-K |
| 09 | Semantic cache | A paraphrase can HIT above the threshold |
| 10 | Cache decision engine | HIT/MISS logic is its own module |
| 11 | Safety guards | Entity, number, time, model, language, scope checks |
| 12 | Hit-rate optimization | Normalization and paraphrase behavior measured |
| 13 | Cost optimization | HIT path has no LLM; cost inputs are explicit |
| 14 | Evaluation dataset | `datasets/test-queries.json` with categories and adversarial cases |
| 15 | Automated benchmarking | `npm run evaluate` writes a hit-rate, latency, and cost report |
| 16 | Frontend chat | Chat shows HIT vs MISS, similarity, and matched query |
| 17 | Analytics dashboard | Requests, hit rate, calls avoided, latency, cost, cost ratio |
| 18 | Cache explorer | Cached queries, scores, response, model, TTL, hit count |
| 19 | Testing | Unit, integration, and semantic cases |
| 20 | Load testing | Latency, hit rate, and throughput at larger volumes |
| 21 | Deployment | Frontend, API, and Redis deployed and smoked |
| 22 | Production benchmark | Hit rate, cost ratio, latency, and correctness on 1,000+ queries |
| 23 | Recruiter demo | Five-part demo script that can be run live |

Admin controls (clear cache, invalidate, threshold, TTL, top-K) land with the dashboard and explorer phases, not before the API behavior exists.

## Secrets

`LLM_API_KEY` and `REDIS_URL` stay on the server. They are never sent to the frontend and never written into logs. `.env.example` lists names only.
