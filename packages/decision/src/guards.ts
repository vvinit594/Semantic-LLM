import { normalizeQuery } from "@semantic-llm/query";

export type SafetyGuard = "entity" | "number" | "time";
export type MetadataGuard = "model" | "language" | "scope";

const TIME_SENSITIVE_WORD =
  /\b(?:today|latest|current|now|price|weather|news|stock)\b/i;

const STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "about",
  "are",
  "can",
  "did",
  "do",
  "does",
  "explain",
  "for",
  "from",
  "how",
  "i",
  "in",
  "into",
  "is",
  "it",
  "me",
  "of",
  "on",
  "or",
  "please",
  "tell",
  "that",
  "the",
  "this",
  "to",
  "was",
  "we",
  "what",
  "when",
  "where",
  "which",
  "who",
  "why",
  "with",
  "you",
  "your",
]);

/** The new question should skip cache reads and writes. */
export function isTimeSensitive(text: string): boolean {
  return TIME_SENSITIVE_WORD.test(text);
}

export function entitiesConflict(left: string, right: string): boolean {
  if (normalizeQuery(left) === normalizeQuery(right)) {
    return false;
  }
  return !sameList(extractEntities(left), extractEntities(right));
}

export function numbersConflict(left: string, right: string): boolean {
  return !sameList(extractNumbers(left), extractNumbers(right));
}

export function modelsConflict(left: string, right: string): boolean {
  return !sameText(left, right);
}

export function languagesConflict(left: string, right: string): boolean {
  const normalizedLeft = left.trim().toLowerCase();
  const normalizedRight = right.trim().toLowerCase();
  return normalizedLeft.length === 0 || normalizedLeft !== normalizedRight;
}

export function scopesConflict(left: string, right: string): boolean {
  return !sameText(left, right);
}

export function metadataGuard(input: {
  model: string;
  candidateModel: string;
  language: string;
  candidateLanguage: string;
  scope: string;
  candidateScope: string;
}): MetadataGuard | undefined {
  if (modelsConflict(input.model, input.candidateModel)) {
    return "model";
  }
  if (languagesConflict(input.language, input.candidateLanguage)) {
    return "language";
  }
  if (scopesConflict(input.scope, input.candidateScope)) {
    return "scope";
  }
  return undefined;
}

/** Entity, number, and time checks. Model, language, and scope are metadata guards. */
export function safetyGuard(query: string, candidateQuery: string): SafetyGuard | undefined {
  if (entitiesConflict(query, candidateQuery)) {
    return "entity";
  }
  if (numbersConflict(query, candidateQuery)) {
    return "number";
  }
  if (isTimeSensitive(query) || isTimeSensitive(candidateQuery)) {
    return "time";
  }
  return undefined;
}

function extractEntities(text: string): string[] {
  const entities = new Set<string>();
  for (const match of text.matchAll(/[A-Za-z][A-Za-z'-]*/g)) {
    const token = match[0];
    if (token === undefined || STOPWORDS.has(token.toLowerCase())) {
      continue;
    }
    if (isProperNoun(token) || isAcronym(token)) {
      entities.add(token.toLowerCase().replace(/'s$/, ""));
    }
  }
  return [...entities].sort();
}

function isProperNoun(token: string): boolean {
  return /^[A-Z][a-z]+(?:-[A-Z][a-z]+)*(?:'[a-z]+)?$/.test(token);
}

function isAcronym(token: string): boolean {
  return /^[A-Z]{2,}$/.test(token);
}

function extractNumbers(text: string): number[] {
  return [...text.matchAll(/\d+(?:\.\d+)?/g)]
    .map((match) => Number(match[0]))
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => left - right);
}

function sameList(left: readonly number[] | readonly string[], right: readonly number[] | readonly string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }
  return left.every((value, index) => value === right[index]);
}

function sameText(left: string, right: string): boolean {
  const normalizedLeft = left.trim();
  const normalizedRight = right.trim();
  return normalizedLeft.length > 0 && normalizedLeft === normalizedRight;
}
