# Production benchmark

Run on 2026-10-02 against the Phase 21 images on this machine. This is a local production-like check, not a cloud deployment. Cache decisions, the 0.85 threshold, embeddings, safety guards, and Gemini retries were not changed.

## What ran

| Piece | Setting |
| --- | --- |
| API | `semantic-llm-api` on host port 3011. `HOST=0.0.0.0`, `PORT=3001`, `REDIS_URL=redis://host.docker.internal:6379`, `WEB_ORIGIN=http://127.0.0.1:3010`. The Gemini key came from the local env file and was not printed. |
| Web | Image `semantic-llm-web:bench`, built with `NEXT_PUBLIC_API_URL=http://127.0.0.1:3011`, on host port 3010. The existing `semantic-llm-web:latest` tag still points at `http://127.0.0.1:3001` and was not used for this check. |
| Redis | The existing Redis Stack container. It was not flushed. |
| Dev servers | Left running on ports 3000 and 3001. |

`GET http://127.0.0.1:3011/health` returned 200 with `redis: "ok"` and `embeddings: "ok"`. The API log showed the embedding model ready and the process listening on the container address, not only on loopback.

The web container's home page returned 200. In the browser, asking "What is a computer?" showed **HIT**, similarity `1.000 exact`, and the same question as the matched query. `/dashboard` showed live metrics from this API process and the saved offline benchmark. `/cache` listed stored entries, and a search for `Load exact` narrowed the list to that question.

## Gemini budget

Miss traffic was capped. The provider still retries HTTP 429 and 503 up to three times, so one chat failure can be three requests to Gemini. Nothing below changed that retry.

| Call | Result |
| --- | --- |
| Exact-hit warmup, `Load exact 9340f13b-9831-4249-9e35-0b88bcf2e86d` | The question was stored and later reused. `pnpm load` gave up at its 30 second client timeout, and the API was restarted before that request logged a completion. Latency for this one store is not reported. |
| Direct REST `generateContent` | HTTP 503 in 1.2 s. High demand. Not an application chat. |
| Same call through `@google/genai` | HTTP 503 in 0.9 s. Not an application chat. |
| Chat `Load probe phase22` | HTTP 503 after about 51 s. Not stored. |
| Two semantic warmups (`What is the capital of France?`, `What is Redis?`) | HTTP 429. Warmup stopped. The other three planned warmups were not sent. |
| Three new questions, `Load miss phase22 1` through `3` | HTTP 429. Not stored. |
| Two later retries of `What is the capital of France?` | HTTP 429, about 2.3 s each, including the provider retries. Stopped. |

That is one stored Gemini answer, two diagnostic calls outside the app, and eight chat calls that failed with 429 or 503. No further Gemini calls were made. The semantic volume and the mixed run reused answers that were already in Redis.

## Measured traffic

Warmup and the single semantic confirmation are not in these rows. Percentiles use the same rank as `pnpm load`: sort the latencies and take `ceil(percent / 100 * n)`.

| Scenario | Requests | Concurrency | rps | p50 / p95 / p99 | Errors | Hit rate | What hit |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Exact HIT | 1,000 | 8 | 1,150.3 | 6.5 / 11.0 / 17.4 ms | 0 | 100% | 1,000 exact. LLM calls avoided: 1,000. |
| Semantic HIT | 300 | 4 | 37.8 | 92.3 / 169.3 / 339.4 ms | 0 | 100% | 300 semantic. LLM calls avoided: 300. |
| Controlled MISS | 3 | 1 | 0.5 | 1,898.6 / 1,979.4 / 1,979.4 ms | 3 (100%) | n/a | Gemini returned 429. No answer was stored. |
| Mixed | 200 | 8 | 62.7 | 152.9 / 254.7 / 360.1 ms | 0 | 100% | 100 exact and 100 semantic. LLM calls avoided: 200. |

The semantic question was `Tell me what a computer is.` It matched the already cached `Can you explain what a computer is?` at similarity 0.917, above 0.85. The five benchmark paraphrases were not warmed, because those warmups were the 429s above.

Mixed traffic was half exact and half semantic. The usual 20% brand-new miss slice was not sent. Those requests would have been more Gemini calls after the 429s.

The API process that served this sample reported, after the runs and one browser exact hit:

| Metric | Value |
| --- | --- |
| Total requests | 1,709 |
| Cache hits / misses | 1,702 / 7 |
| Hit rate | 99.6% |
| Exact / semantic hits | 1,301 / 401 |
| LLM calls | 7 |
| LLM calls avoided | 1,702 |
| Average HIT / MISS | 31.1 ms / 2,972 ms |
| Average embedding / Redis / LLM | 12.7 ms / 28.0 ms / 2,936 ms |
| Average cache-hit cost | $4.30e-7 |
| Average LLM request cost | $0 |
| Reported cost ratio | 0 |

The seven misses are the 429s in this process. They recorded an LLM call with no tokens, so the average LLM price and the ratio are $0 and 0. That is not the cache-hit versus Gemini price ratio. Savings are $0 for the same reason. A successful Gemini completion in this process would have been required for a live ratio.

## Comparison

`docs/benchmark.md` (generated 2026-10-02T15:58:48.210Z) is an in-process run of 37 labeled cases. The LLM is not called. At 0.85 the hit rate is 0.270, there are no false hits, and `learning-paraphrase` is the one false miss. Average hit time is 9.443 ms, average embedding 3.192 ms, average Redis search 5.892 ms. Estimated average cache-hit cost is $1.312e-7, estimated LLM request is $0.000245, and the ratio is 1,870.486.

Those numbers answer a different question from this run:

- The labeled set is mostly expected misses, so 27% is a quality result. This run repeated questions that were already safe hits, so the hit rate stays near 100%. That does not mean production traffic will hit 100%.
- An exact hit on the container (p50 6.5 ms, 1,150 requests per second at concurrency 8) is the Redis read path. It skips the embedding model. The offline 9.443 ms average includes embedding and Redis search for hits that are not exact HTTP reads.
- A semantic hit on the container is slower: p50 92.3 ms and 37.8 requests per second at concurrency 4. The same process, mixing exact and semantic at concurrency 8, moved the combined p50 to 152.9 ms. Embedding work on the API slows the requests sharing that process, including exact hits in the mix.
- The live average cache-hit cost, $4.30e-7, is higher than the offline $1.312e-7 because this average mixes cheap exact hits with semantic hits that spend CPU on the local model, measured through the container.
- The offline ratio of 1,870 stays the cost comparison. This run could not recompute it from Gemini tokens.

The Phase 20 safe load test is a 10-request smoke with a stub model in a local process. It checked that exact, semantic, miss, Redis, and mixed shapes come back. It is not a capacity number, and its sample report in `docs/load-testing.md` is an illustration. This container run is the one with 1,000 or more real requests. `pnpm load` in live mode did not finish an exact-hit window here: the warmup did not return inside the harness timeout of 30 seconds while Gemini was slow, then later warmups were 429.

## After the run

The two Redis keys for `Load exact 9340f13b-9831-4249-9e35-0b88bcf2e86d` were deleted. The computer questions that were already cached were left in place. Redis was not flushed. The benchmark API and web containers were stopped. The Redis Stack container and the dev servers were left running.
