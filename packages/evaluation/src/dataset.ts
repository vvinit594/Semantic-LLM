import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  entitiesConflict,
  isTimeSensitive,
  metadataGuard,
  numbersConflict,
  safetyGuard,
} from "@semantic-llm/decision";
import { normalizeQuery } from "@semantic-llm/query";

export const DATASET_CATEGORIES = [
  "paraphrase",
  "normalization",
  "unrelated",
  "entity-mismatch",
  "number-mismatch",
  "time-sensitive",
  "intent-mismatch",
  "metadata-mismatch",
] as const;

export type DatasetCategory = (typeof DATASET_CATEGORIES)[number];
export type DatasetExpectation = "hit" | "miss";
export type DatasetRisk = "false-hit" | "false-miss";

export type CaseMetadata = {
  model?: string;
  language?: string;
  scope?: string;
};

export type EvaluationCase = {
  id: string;
  category: DatasetCategory;
  cachedQuery: string;
  query: string;
  expect: DatasetExpectation;
  risk: DatasetRisk;
  note?: string;
  cached?: CaseMetadata;
  request?: CaseMetadata;
};

export type EvaluationDataset = {
  version: 1;
  cases: EvaluationCase[];
};

const DEFAULT_MODEL = "gemini:gemini-3.8-flash";
const DEFAULT_LANGUAGE = "en";
const DEFAULT_SCOPE = "public";
const MAX_QUERY_LENGTH = 8_000;
const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export class DatasetError extends Error {
  constructor(readonly problems: readonly string[]) {
    super(problems.join("\n"));
    this.name = "DatasetError";
  }
}

export function datasetPath(): string {
  return resolve(import.meta.dirname, "../../../datasets/test-queries.json");
}

export function loadDataset(path = datasetPath()): EvaluationDataset {
  const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
  return validateDataset(parsed);
}

export function validateDataset(input: unknown): EvaluationDataset {
  const problems: string[] = [];
  if (!isRecord(input)) {
    throw new DatasetError(["dataset must be an object"]);
  }
  if (input.version !== 1) {
    problems.push("version must be 1");
  }
  if (!Array.isArray(input.cases)) {
    throw new DatasetError([...problems, "cases must be an array"]);
  }

  const cases: EvaluationCase[] = [];
  const seenIds = new Set<string>();
  for (const [index, item] of input.cases.entries()) {
    const label = caseLabel(item, index);
    const parsed = parseCase(item, label, problems);
    if (!parsed) {
      continue;
    }
    if (seenIds.has(parsed.id)) {
      problems.push(`${label}: duplicate id ${parsed.id}`);
    }
    seenIds.add(parsed.id);
    checkCase(parsed, label, problems);
    cases.push(parsed);
  }

  for (const category of DATASET_CATEGORIES) {
    if (!cases.some((item) => item.category === category)) {
      problems.push(`missing category ${category}`);
    }
  }

  if (problems.length > 0) {
    throw new DatasetError(problems);
  }
  return { version: 1, cases };
}

function parseCase(item: unknown, label: string, problems: string[]): EvaluationCase | undefined {
  if (!isRecord(item)) {
    problems.push(`${label}: case must be an object`);
    return undefined;
  }
  const id = readString(item.id);
  const category = readString(item.category);
  const cachedQuery = readString(item.cachedQuery);
  const query = readString(item.query);
  const expect = readString(item.expect);
  const risk = readString(item.risk);
  if (!id || !ID_PATTERN.test(id)) {
    problems.push(`${label}: id must be kebab-case`);
  }
  if (!isCategory(category)) {
    problems.push(`${label}: unknown category`);
  }
  if (!cachedQuery || cachedQuery.length > MAX_QUERY_LENGTH) {
    problems.push(`${label}: cachedQuery must be a non-empty string up to 8000 characters`);
  }
  if (!query || query.length > MAX_QUERY_LENGTH) {
    problems.push(`${label}: query must be a non-empty string up to 8000 characters`);
  }
  if (expect !== "hit" && expect !== "miss") {
    problems.push(`${label}: expect must be hit or miss`);
  }
  if (risk !== "false-hit" && risk !== "false-miss") {
    problems.push(`${label}: risk must be false-hit or false-miss`);
  }
  if (item.note !== undefined && (typeof item.note !== "string" || item.note.trim().length === 0)) {
    problems.push(`${label}: note must be a non-empty string`);
  }
  const cached = readMetadata(item.cached, `${label}: cached`, problems);
  const request = readMetadata(item.request, `${label}: request`, problems);
  if (
    !id ||
    !isCategory(category) ||
    !cachedQuery ||
    !query ||
    (expect !== "hit" && expect !== "miss") ||
    (risk !== "false-hit" && risk !== "false-miss") ||
    cached === null ||
    request === null
  ) {
    return undefined;
  }
  return {
    id,
    category,
    cachedQuery,
    query,
    expect,
    risk,
    ...(typeof item.note === "string" ? { note: item.note } : {}),
    ...(cached ? { cached } : {}),
    ...(request ? { request } : {}),
  };
}

function checkCase(item: EvaluationCase, label: string, problems: string[]): void {
  if (item.risk === "false-hit" && item.expect !== "miss") {
    problems.push(`${label}: a false-hit risk must expect a miss`);
  }
  if (item.risk === "false-miss" && item.expect !== "hit") {
    problems.push(`${label}: a false-miss risk must expect a hit`);
  }

  const sameText = normalizeQuery(item.cachedQuery) === normalizeQuery(item.query);
  const guard = safetyGuard(item.cachedQuery, item.query);
  const metadata = metadataGuard({
    model: field(item.request, "model", DEFAULT_MODEL),
    candidateModel: field(item.cached, "model", DEFAULT_MODEL),
    language: field(item.request, "language", DEFAULT_LANGUAGE),
    candidateLanguage: field(item.cached, "language", DEFAULT_LANGUAGE),
    scope: field(item.request, "scope", DEFAULT_SCOPE),
    candidateScope: field(item.cached, "scope", DEFAULT_SCOPE),
  });
  const time = isTimeSensitive(item.cachedQuery) || isTimeSensitive(item.query);

  if (item.category === "metadata-mismatch") {
    if (!metadata) {
      problems.push(`${label}: metadata must conflict`);
    }
    if (guard) {
      problems.push(`${label}: the questions themselves must still be reusable`);
    }
    return;
  }
  if (metadata) {
    problems.push(`${label}: metadata conflict belongs in metadata-mismatch`);
  }

  switch (item.category) {
    case "paraphrase":
      if (sameText) {
        problems.push(`${label}: a paraphrase must change the wording`);
      }
      if (guard || time) {
        problems.push(`${label}: a paraphrase must not trip a safety guard`);
      }
      break;
    case "normalization":
      if (!sameText) {
        problems.push(`${label}: normalization must keep the same wording`);
      }
      if (time) {
        problems.push(`${label}: a time-sensitive question is not a normalization hit`);
      }
      break;
    case "unrelated":
      if (sameText || guard || time) {
        problems.push(`${label}: an unrelated pair must differ without a safety guard`);
      }
      break;
    case "entity-mismatch":
      if (!entitiesConflict(item.cachedQuery, item.query) || guard !== "entity") {
        problems.push(`${label}: the entity guard must be what rejects this pair`);
      }
      break;
    case "number-mismatch":
      if (!numbersConflict(item.cachedQuery, item.query) || guard !== "number") {
        problems.push(`${label}: the number guard must be what rejects this pair`);
      }
      break;
    case "time-sensitive":
      if (!time || guard !== "time") {
        problems.push(`${label}: the time guard must be what rejects this pair`);
      }
      break;
    case "intent-mismatch":
      if (sameText || guard || time) {
        problems.push(`${label}: an intent mismatch must be different wording with no safety guard`);
      }
      break;
    default:
      break;
  }
}

function readMetadata(value: unknown, label: string, problems: string[]): CaseMetadata | undefined | null {
  if (value === undefined) {
    return undefined;
  }
  if (!isRecord(value)) {
    problems.push(`${label} must be an object`);
    return null;
  }
  const metadata: CaseMetadata = {};
  for (const key of ["model", "language", "scope"] as const) {
    const fieldValue = value[key];
    if (fieldValue === undefined) {
      continue;
    }
    if (typeof fieldValue !== "string") {
      problems.push(`${label}.${key} must be a string`);
      return null;
    }
    metadata[key] = fieldValue;
  }
  return metadata;
}

function field(metadata: CaseMetadata | undefined, key: keyof CaseMetadata, fallback: string): string {
  return metadata?.[key] ?? fallback;
}

function caseLabel(item: unknown, index: number): string {
  if (isRecord(item) && typeof item.id === "string" && item.id.length > 0) {
    return item.id;
  }
  return `cases[${index}]`;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function isCategory(value: string | undefined): value is DatasetCategory {
  return DATASET_CATEGORIES.some((category) => category === value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
