export type ProbeKind = "normalization" | "paraphrase" | "adversarial" | "unrelated";
export type ProbeExpectation = "hit" | "miss";

export type HitRateProbe = {
  id: string;
  kind: ProbeKind;
  anchor: string;
  query: string;
  expect: ProbeExpectation;
};

/** Pairwise sample for normalization and paraphrase measurement. The full dataset is a later phase. */
export const HIT_RATE_PROBES: readonly HitRateProbe[] = [
  {
    id: "case",
    kind: "normalization",
    anchor: "What is machine learning?",
    query: "what is machine learning?",
    expect: "hit",
  },
  {
    id: "spacing-punctuation",
    kind: "normalization",
    anchor: "What is machine learning?",
    query: "  WHAT   is   machine learning???  ",
    expect: "hit",
  },
  {
    id: "plus-spacing",
    kind: "normalization",
    anchor: "What is 2+2?",
    query: "What is 2 + 2?",
    expect: "hit",
  },
  {
    id: "france-paraphrase",
    kind: "paraphrase",
    anchor: "What is the capital of France?",
    query: "Which city is the capital of France?",
    expect: "hit",
  },
  {
    id: "learning-paraphrase",
    kind: "paraphrase",
    anchor: "What is machine learning?",
    query: "Can you explain machine learning?",
    expect: "hit",
  },
  {
    id: "redis-paraphrase",
    kind: "paraphrase",
    anchor: "What is Redis?",
    query: "Can you explain what Redis is?",
    expect: "hit",
  },
  {
    id: "india-china",
    kind: "adversarial",
    anchor: "What is the capital of India?",
    query: "What is the capital of China?",
    expect: "miss",
  },
  {
    id: "india-china-case",
    kind: "adversarial",
    anchor: "What is the capital of India?",
    query: "what is the capital of china?",
    expect: "miss",
  },
  {
    id: "two-plus-two",
    kind: "adversarial",
    anchor: "What is 2+2?",
    query: "What is 2+3?",
    expect: "miss",
  },
  {
    id: "latest-news",
    kind: "adversarial",
    anchor: "What is the latest news?",
    query: "What is the latest news?",
    expect: "miss",
  },
  {
    id: "current-weather",
    kind: "adversarial",
    anchor: "What is the weather?",
    query: "What is the current weather?",
    expect: "miss",
  },
  {
    id: "learning-pasta",
    kind: "unrelated",
    anchor: "What is machine learning?",
    query: "How do I boil pasta?",
    expect: "miss",
  },
  {
    id: "france-pasta",
    kind: "unrelated",
    anchor: "What is the capital of France?",
    query: "How do I boil pasta?",
    expect: "miss",
  },
  {
    id: "learning-deep-learning",
    kind: "unrelated",
    anchor: "What is machine learning?",
    query: "What is deep learning?",
    expect: "miss",
  },
];

export const CANDIDATE_THRESHOLDS = [0.8, 0.85, 0.88, 0.9, 0.92, 0.95] as const;
