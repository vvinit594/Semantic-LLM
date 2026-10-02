import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DecisionError,
  decideCache,
  type DecisionCandidate,
  type DecisionContext,
} from "./engine";

const now = new Date("2026-10-02T12:00:00.000Z");

const context: DecisionContext = {
  query: "Which city is the capital of France?",
  model: "gemini:gemini-3.8-flash",
  language: "en",
  scope: "public",
  threshold: 0.85,
  now,
};

test("a candidate at the threshold with matching metadata and remaining TTL is a hit", () => {
  const decision = decideCache(context, [candidate({ score: 0.85 })]);

  assert.deepEqual(decision, {
    decision: "hit",
    id: "paris",
    response: "Paris is the capital of France.",
    score: 0.85,
  });
});

test("no candidate or a score below the threshold is a miss", () => {
  assert.deepEqual(decideCache(context, []), { decision: "miss", reason: "no-candidate" });
  assert.deepEqual(decideCache(context, [candidate({ score: 0.849 })]), {
    decision: "miss",
    reason: "below-threshold",
  });
});

test("model, language, and scope must match", () => {
  assert.deepEqual(decideCache(context, [candidate({ model: "gemini:other" })]), {
    decision: "miss",
    reason: "metadata",
  });
  assert.deepEqual(decideCache(context, [candidate({ language: "fr" })]), {
    decision: "miss",
    reason: "metadata",
  });
  assert.equal(decideCache({ ...context, language: "EN" }, [candidate({ language: "en" })]).decision, "hit");
  assert.deepEqual(decideCache(context, [candidate({ scope: "tenant" })]), {
    decision: "miss",
    reason: "metadata",
  });
  assert.deepEqual(decideCache(context, [candidate({ scope: "" })]), {
    decision: "miss",
    reason: "metadata",
  });
});

test("an expired candidate is a miss and a later fresh candidate can still hit", () => {
  const stale = candidate({ id: "stale", score: 0.99, expiresAt: "2026-10-02T11:59:59.000Z" });
  const fresh = candidate({ id: "fresh", score: 0.9, response: "still valid" });

  assert.deepEqual(decideCache(context, [stale]), { decision: "miss", reason: "stale" });
  assert.deepEqual(decideCache(context, [candidate({ expiresAt: now.toISOString() })]), {
    decision: "miss",
    reason: "stale",
  });
  assert.deepEqual(decideCache(context, [stale, fresh]), {
    decision: "hit",
    id: "fresh",
    response: "still valid",
    score: 0.9,
  });
});

test("a compatible candidate below the threshold does not replace a metadata miss", () => {
  const wrongModel = candidate({ score: 0.99, model: "gemini:other" });
  const tooLow = candidate({ score: 0.5 });

  assert.deepEqual(decideCache(context, [wrongModel, tooLow]), {
    decision: "miss",
    reason: "metadata",
  });
});

test("a nearer incompatible candidate does not hide a compatible one", () => {
  const otherModel = candidate({ id: "other", score: 0.98, model: "gemini:other" });
  const sameModel = candidate({ id: "same", score: 0.9 });

  assert.deepEqual(decideCache(context, [sameModel, otherModel]), {
    decision: "hit",
    id: "same",
    response: "Paris is the capital of France.",
    score: 0.9,
  });
});

test("India and China cannot reuse an answer even when similarity is high", () => {
  const decision = decideCache(
    { ...context, query: "What is the capital of India?" },
    [candidate({ query: "What is the capital of China?", score: 0.99, response: "Beijing." })],
  );

  assert.deepEqual(decision, { decision: "miss", reason: "guard", guard: "entity" });
});

test("2+2 and 2+3 cannot reuse an answer even when similarity is high", () => {
  const decision = decideCache(
    { ...context, query: "What is 2+2?" },
    [candidate({ query: "What is 2+3?", score: 0.99, response: "5" })],
  );

  assert.deepEqual(decision, { decision: "miss", reason: "guard", guard: "number" });
});

test("a current or latest question bypasses a similar cached answer", () => {
  const latest = decideCache(
    { ...context, query: "What is the latest news?" },
    [candidate({ query: "What is the latest news?", score: 1, response: "old headline" })],
  );
  const current = decideCache(
    { ...context, query: "What is the weather?" },
    [candidate({ query: "What is the current weather?", score: 0.96, response: "sunny" })],
  );

  assert.deepEqual(latest, { decision: "miss", reason: "guard", guard: "time" });
  assert.deepEqual(current, { decision: "miss", reason: "guard", guard: "time" });
});

test("the same numbers and the same entity can still hit", () => {
  const sameSum = decideCache(
    { ...context, query: "What is 2 + 2?" },
    [candidate({ query: "What is 2+2?", score: 0.96, response: "4" })],
  );
  const sameCountry = decideCache(context, [candidate({ score: 0.94 })]);

  assert.equal(sameSum.decision, "hit");
  assert.equal(sameCountry.decision, "hit");
});

test("a guarded neighbor does not hide a later safe candidate", () => {
  const china = candidate({
    id: "china",
    query: "What is the capital of China?",
    score: 0.99,
    response: "Beijing.",
  });
  const france = candidate({ id: "france", score: 0.9 });

  assert.deepEqual(decideCache({ ...context, query: "What is the capital of France?" }, [china, france]), {
    decision: "hit",
    id: "france",
    response: "Paris is the capital of France.",
    score: 0.9,
  });
});

test("an invalid threshold or clock is rejected", () => {
  assert.throws(() => decideCache({ ...context, threshold: 0 }, []), DecisionError);
  assert.throws(() => decideCache({ ...context, now: new Date("not-a-date") }, []), DecisionError);
});

function candidate(overrides: Partial<DecisionCandidate> = {}): DecisionCandidate {
  return {
    id: "paris",
    query: "What is the capital of France?",
    score: 0.94,
    response: "Paris is the capital of France.",
    model: "gemini:gemini-3.8-flash",
    language: "en",
    scope: "public",
    expiresAt: "2026-10-03T12:00:00.000Z",
    ...overrides,
  };
}
