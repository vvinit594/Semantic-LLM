# Cost

Measured on 2026-10-02. The embedding model was a warm local `all-MiniLM-L6-v2`. Redis was the local Redis Stack container. The LLM figures are one Gemini 3.8 Flash call whose prompt was “Reply with the single word Paris.”

## Prices used

- Embedding API: $0. A hit does not call a paid embedding API.
- Local compute, used only to price measured CPU time: $0.05 per vCPU-hour. This is a stated planning rate, not a cloud invoice.
- Gemini 3.8 Flash introductory list price through 2026-12-31: $0.75 per 1M input tokens and $3.75 per 1M output tokens. Output includes thinking tokens. From 2027-01-01 the list price is $1.50 and $7.50. Source: [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing).

The LLM request cost is the token bill. The time spent waiting on Gemini is recorded and is not added as local CPU.

## Measurement

Warm median of five calls after one warmup, from a fresh process:

| Input | Value |
| --- | --- |
| Embedding time | 39.5 ms |
| Redis KNN time | 6.58 ms |
| Gemini input tokens | 8 |
| Gemini output tokens | 64 |
| Gemini wall time | 9472 ms |

A hotter run in the same session measured 3.66 ms to embed and 1.37 ms to search. The table uses the slower run.

## Result

| Cost | USD |
| --- | --- |
| Embedding API | 0 |
| Semantic HIT (embed CPU + Redis CPU) | 0.000000641 |
| Exact HIT (Redis only) | 0.0000000914 |
| LLM input | 0.000006 |
| LLM output | 0.000240 |
| LLM request | 0.000246 |

Ratio = LLM request cost / semantic HIT cost = **384** on the slower run, and 3519 on the hotter run.

That is above the Goal A line of 100. The ratio is this measurement, not a fixed constant. If a run has hits but no LLM call, the metrics snapshot leaves the ratio null.

An exact hit does not run the embedding model. A semantic hit does not call the LLM. Set `MEASURE_LLM_COST=1` to replace the token counts with a new Gemini call.
