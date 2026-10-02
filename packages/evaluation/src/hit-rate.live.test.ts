import assert from "node:assert/strict";
import { test } from "node:test";
import { createLocalEmbeddingService } from "@semantic-llm/embeddings";
import { embeddingText } from "@semantic-llm/query";
import { HIT_RATE_PROBES } from "./probes";
import { observePair, summarize, summarizeThresholds, wouldReuse, type ProbeObservation } from "./report";

test("the probe set has no false hits at 0.85 and normalization probes hit", async () => {
  const service = createLocalEmbeddingService();
  await service.init();
  const vectors = new Map<string, number[]>();

  const observations: ProbeObservation[] = [];
  for (const probe of HIT_RATE_PROBES) {
    const score = dot(await embed(service, vectors, probe.anchor), await embed(service, vectors, probe.query));
    const observation = observePair(probe, score);
    observations.push(observation);
    if (probe.kind === "normalization" || probe.kind === "adversarial") {
      assert.equal(wouldReuse(observation, 0.85), probe.expect === "hit", probe.id);
    }
  }

  const rows = summarizeThresholds(observations);
  const atProduction = summarize(observations, 0.85);
  const at92 = rows.find((row) => row.threshold === 0.92);
  const at95 = rows.find((row) => row.threshold === 0.95);
  assert.equal(atProduction.falseHitRate, 0);
  assert.equal(at92?.hits, atProduction.hits);
  assert.ok(at95 !== undefined && at95.correctHitRate < atProduction.correctHitRate);
  assert.ok(observations.some((observation) => observation.probe.kind === "paraphrase" && wouldReuse(observation, 0.85)));
});

async function embed(
  service: { embed(text: string): Promise<number[]> },
  vectors: Map<string, number[]>,
  text: string,
): Promise<number[]> {
  const key = embeddingText(text);
  const cached = vectors.get(key);
  if (cached) {
    return cached;
  }
  const vector = await service.embed(key);
  vectors.set(key, vector);
  return vector;
}

function dot(left: number[], right: number[]): number {
  let sum = 0;
  for (let index = 0; index < left.length; index += 1) {
    sum += (left[index] ?? 0) * (right[index] ?? 0);
  }
  return sum;
}
