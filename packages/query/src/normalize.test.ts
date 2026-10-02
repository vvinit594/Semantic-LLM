import assert from "node:assert/strict";
import { test } from "node:test";
import { embeddingText, normalizeQuery } from "./normalize";

test("case, spacing, and trailing punctuation normalize to one question", () => {
  const expected = "what is machine learning";
  assert.equal(normalizeQuery("What is machine learning?"), expected);
  assert.equal(normalizeQuery("  WHAT   is   machine learning???  "), expected);
  assert.equal(normalizeQuery("what is machine learning"), expected);
  assert.equal(normalizeQuery(normalizeQuery("What is machine learning?")), expected);
});

test("numbers and names stay distinct", () => {
  assert.notEqual(normalizeQuery("What is 2+2?"), normalizeQuery("What is 2+3?"));
  assert.equal(normalizeQuery("What is 2 + 2?"), normalizeQuery("What is 2+2?"));
  assert.notEqual(
    normalizeQuery("What is the capital of India?"),
    normalizeQuery("What is the capital of China?"),
  );
  assert.equal(normalizeQuery("What is the latest news?"), "what is the latest news");
});

test("embedding text keeps a question that is only punctuation", () => {
  assert.equal(embeddingText("???"), "???");
  assert.equal(embeddingText("What is Redis?"), "what is redis");
});
