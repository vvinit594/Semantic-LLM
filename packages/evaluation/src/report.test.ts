import assert from "node:assert/strict";
import { test } from "node:test";
import { observePair, summarize, wouldReuse } from "./report";
import type { HitRateProbe } from "./probes";

test("normalization hits without a high score, and guards block a high score", () => {
  const caseProbe = probe("case", "normalization", "What is Redis?", "what is redis?", "hit");
  const countries = probe(
    "countries",
    "adversarial",
    "What is the capital of India?",
    "What is the capital of China?",
    "miss",
  );
  const latest = probe("latest", "adversarial", "What is the latest news?", "What is the latest news?", "miss");
  const paraphrase = probe(
    "paraphrase",
    "paraphrase",
    "What is the capital of France?",
    "Which city is the capital of France?",
    "hit",
  );

  const observations = [
    observePair(caseProbe, 0.2),
    observePair(countries, 0.99),
    observePair(latest, 1),
    observePair(paraphrase, 0.9),
  ];

  assert.equal(wouldReuse(observations[0]!, 0.85), true);
  assert.equal(wouldReuse(observations[1]!, 0.8), false);
  assert.equal(observations[1]?.guard, "entity");
  assert.equal(wouldReuse(observations[2]!, 0.8), false);
  assert.equal(wouldReuse(observations[3]!, 0.85), true);
  assert.equal(wouldReuse(observations[3]!, 0.95), false);

  const row = summarize(observations, 0.85);
  assert.equal(row.hits, 2);
  assert.equal(row.falseHitRate, 0);
  assert.equal(row.correctHitRate, 1);
  assert.equal(row.falseMissRate, 0);
});

function probe(
  id: string,
  kind: HitRateProbe["kind"],
  anchor: string,
  query: string,
  expect: HitRateProbe["expect"],
): HitRateProbe {
  return { id, kind, anchor, query, expect };
}
