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

test("the answer text is not inspected for safety guards", () => {
  const decision = decideCache(context, [
    candidate({ response: "The capital of China is Beijing.", score: 0.97 }),
  ]);

  assert.equal(decision.decision, "hit");
  if (decision.decision === "hit") {
    assert.equal(decision.response, "The capital of China is Beijing.");
  }
});

test("an invalid threshold or clock is rejected", () => {
  assert.throws(() => decideCache({ ...context, threshold: 0 }, []), DecisionError);
  assert.throws(() => decideCache({ ...context, now: new Date("not-a-date") }, []), DecisionError);
});

function candidate(overrides: Partial<DecisionCandidate> = {}): DecisionCandidate {
  return {
    id: "paris",
    score: 0.94,
    response: "Paris is the capital of France.",
    model: "gemini:gemini-3.8-flash",
    language: "en",
    scope: "public",
    expiresAt: "2026-10-03T12:00:00.000Z",
    ...overrides,
  };
}
