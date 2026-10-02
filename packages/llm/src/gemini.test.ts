import assert from "node:assert/strict";
import { test } from "node:test";
import {
  GEMINI_RETRY_BASE_DELAY_MS,
  GeminiProvider,
  MissingGeminiApiKeyError,
  TransientGeminiError,
  transientGeminiStatus,
  withTransientRetry,
} from "./gemini";

test("429 and 503 are transient, including the Gemini JSON body", () => {
  const rateLimited = new Error("slow down");
  Object.assign(rateLimited, { status: 429 });
  const unavailable = new Error(
    JSON.stringify({
      error: {
        code: 503,
        message: "This model is currently experiencing high demand.",
        status: "UNAVAILABLE",
      },
    }),
  );
  const rejected = new Error("bad request");
  Object.assign(rejected, { status: 400 });

  assert.equal(transientGeminiStatus(rateLimited), 429);
  assert.equal(transientGeminiStatus(unavailable), 503);
  assert.equal(transientGeminiStatus(rejected), undefined);
  assert.equal(transientGeminiStatus(new MissingGeminiApiKeyError()), undefined);
});

test("a transient failure retries with exponential backoff, then returns the answer", async () => {
  const delays: number[] = [];
  let calls = 0;
  const text = await withTransientRetry(
    async () => {
      calls += 1;
      if (calls < 3) {
        const error = new Error("busy");
        Object.assign(error, { status: calls === 1 ? 503 : 429 });
        throw error;
      }
      return "Paris";
    },
    {
      sleep: async (ms) => {
        delays.push(ms);
      },
    },
  );

  assert.equal(text, "Paris");
  assert.equal(calls, 3);
  assert.deepEqual(delays, [GEMINI_RETRY_BASE_DELAY_MS, GEMINI_RETRY_BASE_DELAY_MS * 2]);
});

test("retries stop after the bound and keep the upstream status", async () => {
  let calls = 0;
  const cause = new Error("high demand");
  Object.assign(cause, { statusCode: 503 });

  await assert.rejects(
    () =>
      withTransientRetry(
        async () => {
          calls += 1;
          throw cause;
        },
        { sleep: async () => {} },
      ),
    (error: unknown) => {
      assert.ok(error instanceof TransientGeminiError);
      assert.equal(error.status, 503);
      assert.equal(error.message, "The model is temporarily unavailable. Please try again in a moment.");
      assert.equal(error.cause, cause);
      return true;
    },
  );
  assert.equal(calls, 3);
});

test("a non-transient provider error is not retried", async () => {
  let calls = 0;
  await assert.rejects(
    () =>
      withTransientRetry(async () => {
        calls += 1;
        const error = new Error("bad request");
        Object.assign(error, { status: 400 });
        throw error;
      }, { sleep: async () => {} }),
    /bad request/,
  );
  assert.equal(calls, 1);
});

test("Gemini retries a 503 and then reads the same token counts", async () => {
  let calls = 0;
  const provider = new GeminiProvider("test-key", "gemini-3.8-flash", {
    sleep: async () => {},
    generate: async () => {
      calls += 1;
      if (calls === 1) {
        const error = new Error("unavailable");
        Object.assign(error, { status: 503 });
        throw error;
      }
      return {
        text: "Paris",
        usageMetadata: { promptTokenCount: 8, candidatesTokenCount: 40, thoughtsTokenCount: 24 },
      };
    },
  });

  const completion = await provider.completeWithUsage("capital?");
  assert.equal(calls, 2);
  assert.deepEqual(completion, { text: "Paris", inputTokens: 8, outputTokens: 64 });
});

test("an empty Gemini response is not retried", async () => {
  let calls = 0;
  const provider = new GeminiProvider("test-key", "gemini-3.8-flash", {
    sleep: async () => {},
    generate: async () => {
      calls += 1;
      return { text: "   " };
    },
  });

  await assert.rejects(() => provider.complete("capital?"), /empty response/);
  assert.equal(calls, 1);
});

test("a missing Gemini key fails before any request", async () => {
  let calls = 0;
  const provider = new GeminiProvider("  ", "gemini-3.8-flash", {
    sleep: async () => {},
    generate: async () => {
      calls += 1;
      return { text: "unused" };
    },
  });

  await assert.rejects(() => provider.complete("capital?"), MissingGeminiApiKeyError);
  assert.equal(calls, 0);
});
