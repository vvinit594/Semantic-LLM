# Hit-rate probe

Measured on 2026-10-02 with local `all-MiniLM-L6-v2`, after query normalization. This is a pairwise sample of 14 probes, not the later full evaluation dataset. Each probe compares one cached question with one new question. The decision matches the chat path: a time-sensitive question misses, an identical normalized question hits, a safety guard miss stays a miss, and any other pair hits only when cosine similarity reaches the threshold.

Normalization is case, whitespace, trailing punctuation, and spaces around `+`. It does not replace words. Production threshold stays **0.85**.

## Scores

| Probe | Kind | Expect | Score | At 0.85 | Why |
| --- | --- | --- | --- | --- | --- |
| case | normalization | hit | 1.000 | hit | same normalized text |
| spacing-punctuation | normalization | hit | 1.000 | hit | same normalized text |
| plus-spacing | normalization | hit | 1.000 | hit | `2 + 2` and `2+2` |
| france-paraphrase | paraphrase | hit | 0.967 | hit | similarity |
| redis-paraphrase | paraphrase | hit | 0.948 | hit | similarity |
| learning-paraphrase | paraphrase | hit | 0.784 | miss | below every candidate threshold |
| india-china | adversarial | miss | 0.466 | miss | entity guard |
| india-china-case | adversarial | miss | 0.466 | miss | entity guard |
| two-plus-two | adversarial | miss | 0.867 | miss | number guard |
| latest-news | adversarial | miss | 1.000 | miss | time-sensitive bypass |
| current-weather | adversarial | miss | 0.750 | miss | time-sensitive bypass |
| learning-pasta | unrelated | miss | 0.063 | miss | similarity |
| france-pasta | unrelated | miss | 0.038 | miss | similarity and entity guard |
| learning-deep-learning | unrelated | miss | 0.606 | miss | similarity |

`2+2` versus `2+3` scores **0.867**. At 0.85 that pair would be a false hit if the number guard were removed. India versus China stays a miss both because the entity guard rejects it and because the score is 0.466.

## Thresholds

Hit rate is reuse decisions divided by all 14 probes. Correct hit rate is expected hits that reused, divided by the 6 expected hits. False hit rate is expected misses that reused, divided by the 8 expected misses. False miss rate is expected hits that did not reuse, divided by the 6 expected hits.

| Threshold | Hit rate | Correct hit rate | False hit rate | False miss rate | Miss rate |
| --- | --- | --- | --- | --- | --- |
| 0.80 | 0.357 | 0.833 | 0 | 0.167 | 0.643 |
| 0.85 | 0.357 | 0.833 | 0 | 0.167 | 0.643 |
| 0.88 | 0.357 | 0.833 | 0 | 0.167 | 0.643 |
| 0.90 | 0.357 | 0.833 | 0 | 0.167 | 0.643 |
| 0.92 | 0.357 | 0.833 | 0 | 0.167 | 0.643 |
| 0.95 | 0.286 | 0.667 | 0 | 0.333 | 0.714 |

From 0.80 through 0.92 the decisions on this set do not change. 0.95 also misses the Redis paraphrase (0.948). The only false miss inside that plateau is “Can you explain machine learning?” at 0.784, which none of the candidate thresholds recover. Embedding time does not depend on the threshold. This probe does not time Redis or the LLM.

The production threshold stays 0.85. Lowering it does not add a correct hit on this set, and the number guard is what keeps the 0.867 arithmetic pair from becoming a false hit.
