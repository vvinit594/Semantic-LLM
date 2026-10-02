import assert from "node:assert/strict";
import { test } from "node:test";
import { DATASET_CATEGORIES, DatasetError, loadDataset, validateDataset, type EvaluationCase } from "./dataset";

test("the evaluation dataset covers every category and agrees with the guards", () => {
  const dataset = loadDataset();
  const counts = new Map<string, number>();
  for (const item of dataset.cases) {
    counts.set(item.category, (counts.get(item.category) ?? 0) + 1);
  }

  assert.equal(dataset.version, 1);
  assert.equal(dataset.cases.length, 37);
  for (const category of DATASET_CATEGORIES) {
    assert.ok((counts.get(category) ?? 0) >= 3, category);
  }
  assert.equal(dataset.cases.find((item) => item.id === "learning-paraphrase")?.expect, "hit");
  assert.equal(dataset.cases.find((item) => item.id === "two-plus-three")?.expect, "miss");
  assert.equal(dataset.cases.find((item) => item.id === "latest-news")?.expect, "miss");
});

test("a mislabeled case is rejected", () => {
  const dataset = loadDataset();
  const entity = dataset.cases.find((item) => item.id === "india-china");
  assert.ok(entity);

  assert.throws(
    () => validateDataset({ version: 1, cases: [entity, { ...entity }] }),
    (error: unknown) => error instanceof DatasetError && error.problems.some((problem) => problem.includes("duplicate id")),
  );
  assert.throws(
    () => validateDataset({ version: 1, cases: [{ ...entity, category: "paraphrase", expect: "hit", risk: "false-miss" }] }),
    DatasetError,
  );
  assert.throws(
    () => validateDataset({ version: 1, cases: [{ ...entity, category: "time-sensitive" }] }),
    DatasetError,
  );
  assert.throws(
    () => validateDataset({ version: 1, cases: [{ ...base(), risk: "false-hit", expect: "hit" }] }),
    DatasetError,
  );
  assert.throws(() => validateDataset({ version: 1, cases: [{ ...base(), category: "other" }] }), DatasetError);
});

function base(): EvaluationCase {
  return {
    id: "sample",
    category: "unrelated",
    cachedQuery: "What is gravity?",
    query: "How do I start knitting?",
    expect: "miss",
    risk: "false-hit",
  };
}
