# Benchmark

Generated 2026-10-02T10:18:10.815Z. Local embedding model `all-MiniLM-L6-v2`. 37 labeled cases from `datasets/test-queries.json`.

Production similarity threshold stays **0.85**. This run does not change it.

Each case stores one cached question in Redis, searches with the new question, and decides with `decideCache`. Records use ids starting with `bench-` and are deleted when the run finishes. The LLM is not called. Input tokens are estimated as characters divided by 4. Output tokens use the measured Gemini 3.8 Flash size of 64.

## Thresholds

| Threshold | Hit rate | Correct hit rate | False hit rate | False miss rate | Miss rate | Avg hit ms | Avg miss ms |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 0.80 | 0.270 | 0.909 | 0.000 | 0.091 | 0.730 | 54.106 | 33.524 |
| 0.85 | 0.270 | 0.909 | 0.000 | 0.091 | 0.730 | 54.106 | 33.524 |
| 0.88 | 0.270 | 0.909 | 0.000 | 0.091 | 0.730 | 54.106 | 33.524 |
| 0.90 | 0.270 | 0.909 | 0.000 | 0.091 | 0.730 | 54.106 | 33.524 |
| 0.92 | 0.243 | 0.818 | 0.000 | 0.182 | 0.757 | 55.489 | 33.815 |
| 0.95 | 0.216 | 0.727 | 0.000 | 0.273 | 0.784 | 56.680 | 34.234 |

## Categories at 0.85

| Category | Cases | Hit rate | False hits | False misses |
| --- | --- | --- | --- | --- |
| paraphrase | 6 | 0.833 | 0 | 1 |
| normalization | 5 | 1.000 | 0 | 0 |
| unrelated | 4 | 0.000 | 0 | 0 |
| entity-mismatch | 5 | 0.000 | 0 | 0 |
| number-mismatch | 4 | 0.000 | 0 | 0 |
| time-sensitive | 5 | 0.000 | 0 | 0 |
| intent-mismatch | 5 | 0.000 | 0 | 0 |
| metadata-mismatch | 3 | 0.000 | 0 | 0 |

## Latency

| Measure | ms |
| --- | --- |
| Average embedding | 28.273 |
| Average Redis search | 15.715 |
| Average hit | 54.106 |
| Average miss | 33.524 |

Hit and miss latency follow the request path. A time-sensitive question skips embedding and Redis, so its request time is 0. Other cases include the measured embedding and Redis search.

## Cost

| Cost | USD |
| --- | --- |
| Embedding API per call | 0 |
| Average cache hit | 7.515e-7 |
| Average LLM request | 0.000245 |
| Ratio (LLM / hit) | 326.466 |

Thresholds 0.80, 0.85, 0.88, 0.90 make the same decisions on this set. Production stays 0.85.

Applied threshold: 0.85.

## False hits at 0.85

None.

## False misses at 0.85

- learning-paraphrase (paraphrase, score 0.784)
