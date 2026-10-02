# Load testing

`pnpm load` measures the existing `POST /api/chat` API. It does not change the cache, the 0.85 similarity threshold, embeddings, the decision engine, or Gemini retries.

Safe mode is the default. It starts a temporary API on a free local port, uses the local embedding model and Redis, and answers misses with a stub model. Gemini is not called. The run deletes only the stub entries it created. It does not flush Redis.

Live mode sends HTTP to an API that is already running. That API uses the real Gemini provider on a cache miss.

## Scenarios

| Scenario | What it sends | What it measures |
| --- | --- | --- |
| `exact-hit` | One warmed question, repeated | Exact cache reads. After warmup this path is Redis only: no embedding and no LLM. |
| `semantic-hit` | A warmed question, then a paraphrase | Local embedding, Redis vector search, and a hit when the score stays at or above 0.85. |
| `miss` | A new question every request | A cache miss. Safe mode times the stub. Live mode calls Gemini. |
| `redis` | Several warmed questions, then random repeats | Redis reads across a working set, rather than one hot key. |
| `mixed` | About 50% exact, 30% semantic, 20% miss | Combined traffic. |
| `all` | Each scenario, one after another | A full pass. In live mode, scenarios that would call Gemini are skipped unless `--allow-llm` is set. |

Semantic questions are paraphrases the benchmark already treated as hits. The known hard pair, "What is machine learning?" / "Can you explain machine learning?", is not in this set because it scores under 0.85.

Warmup runs before the timer. A warmed miss is an LLM call, and it is reported separately from the measured window.

## Run it

Redis has to be up (`pnpm redis:up`). From the repo root:

```powershell
pnpm load
pnpm load -- --scenario=exact-hit --concurrency=16 --requests=200
pnpm load -- --scenario=all --concurrency=8 --duration=20s --requests=500
pnpm load -- --mode=live --scenario=exact-hit --requests=100
pnpm load -- --mode=live --scenario=miss --allow-llm --requests=10 --max-llm-calls=10
pnpm load -- --help
```

| Flag | Meaning |
| --- | --- |
| `--mode=safe` | Default. Stub LLM. No Gemini calls. |
| `--mode=live` | Send to `--url`. Default `http://127.0.0.1:3001`. |
| `--scenario=` | `exact-hit`, `semantic-hit`, `miss`, `redis`, `mixed`, or `all`. |
| `--concurrency=` | Workers. Default 8. |
| `--requests=` | Measured requests. Default 50. |
| `--duration=20s` | Also accepts `ms` and `m`. With `--requests`, stop at whichever comes first. Without `--requests`, stop at the time limit. |
| `--allow-llm` | Required for live `miss`, `mixed`, and `redis`. |
| `--max-llm-calls=` | Live ceiling, including warmup. Default 25. The run also stops during a live test if misses reach this ceiling. |
| `--working-set=` | Distinct keys for `redis`. Default 16. |
| `--out=FILE` | Write the JSON report. |

A live `miss` or `mixed` run also needs `--requests`, so the Gemini count is known before it starts. The plan is refused when warmup plus planned misses is above `--max-llm-calls`.

## How to read the report

```text
exact-hit (safe)
Completed: 200    Errors: 0    Error rate: 0.0%
Requests per second: 840.2    Elapsed: 238.0 ms
Latency p50/p95/p99: 8.1 ms / 14.4 ms / 21.0 ms
Cache hit rate: 100.0%    Exact hits: 200    Semantic hits: 0    Misses: 0
LLM calls: 1 (1 during warmup)    LLM calls avoided: 200
```

The numbers above are an illustration of the layout, not a measured run.

- **Requests per second** is the throughput. It is completed requests, including errors, divided by the measured window. Warmup is not included.
- **p50** is the median latency. **p95** and **p99** are the slow tail. Exact hits should usually be faster than semantic hits, because an exact hit skips the embedding model.
- **Error rate** should be 0%. Anything else is a failed HTTP request, a Redis failure, or a provider error.
- **Cache hit rate** is successful chat responses that reused an answer, divided by successful chat responses. Errors are not part of that rate.
- **LLM calls avoided** is the number of measured cache hits. Those requests did not call the model.
- **LLM calls** in safe mode are stub calls and do not cost Gemini money. In live mode they are Gemini calls, including warmup. A semantic hit rate below 100% means some paraphrases missed 0.85, and each of those misses called the model.

Compare scenarios from the same run rather than from different machines. The first semantic requests include local model work. A later exact-hit run is the number to use for the Redis read path. One `pnpm load` process keeps the stub cache, so a later scenario can hit an entry stored by an earlier one. The warmup LLM count shows when that happened.

## Safety

Safe mode does not construct the Gemini client. A killed safe run can leave entries whose model starts with `stub:load-` for up to one hour. Those entries fail the model check against Gemini, so the normal API does not return them as hits. Run `pnpm load` again, or wait for the TTL, to clear them.

Live mode writes into the normal cache and does not delete those entries. They expire with the normal TTL. `exact-hit` and `semantic-hit` should call Gemini only while warming, unless a paraphrase misses. `miss`, `mixed`, and `redis` are refused until you pass `--allow-llm`.
