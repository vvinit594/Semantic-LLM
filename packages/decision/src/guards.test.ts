import assert from "node:assert/strict";
import { test } from "node:test";
import {
  entitiesConflict,
  isTimeSensitive,
  languagesConflict,
  modelsConflict,
  numbersConflict,
  scopesConflict,
} from "./guards";

test("India and China conflict, while a France paraphrase does not", () => {
  assert.equal(
    entitiesConflict("What is the capital of India?", "What is the capital of China?"),
    true,
  );
  assert.equal(
    entitiesConflict("What is the capital of France?", "Which city is the capital of France?"),
    false,
  );
  assert.equal(entitiesConflict("What is machine learning?", "Can you explain machine learning?"), false);
});

test("2+2 conflicts with 2+3 and matches 2 + 2", () => {
  assert.equal(numbersConflict("What is 2+2?", "What is 2+3?"), true);
  assert.equal(numbersConflict("What is 2+2?", "What is 2 + 2?"), false);
  assert.equal(numbersConflict("What is the capital of France?", "Which city is the capital of France?"), false);
});

test("today, latest, current, now, price, weather, news, and stock are time-sensitive", () => {
  for (const query of [
    "What happened today?",
    "What is the latest news?",
    "What is the current price of gold?",
    "What time is it now?",
    "What is the weather?",
    "What is the stock price?",
  ]) {
    assert.equal(isTimeSensitive(query), true, query);
  }
  assert.equal(isTimeSensitive("How do I gain knowledge?"), false);
  assert.equal(isTimeSensitive("What is machine learning?"), false);
});

test("model, language, and scope guards reject an incompatible pair", () => {
  assert.equal(modelsConflict("gemini:gemini-3.8-flash", "gemini:gemini-2.5-flash"), true);
  assert.equal(modelsConflict("gemini:gemini-3.8-flash", " gemini:gemini-3.8-flash "), false);
  assert.equal(languagesConflict("en", "fr"), true);
  assert.equal(languagesConflict("EN", "en"), false);
  assert.equal(scopesConflict("public", "tenant"), true);
  assert.equal(scopesConflict("public", "public"), false);
  assert.equal(scopesConflict("", "public"), true);
});