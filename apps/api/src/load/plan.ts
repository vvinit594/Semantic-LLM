export const LOAD_SCENARIOS = ["exact-hit", "semantic-hit", "miss", "redis", "mixed"] as const;

export type ScenarioName = (typeof LOAD_SCENARIOS)[number];
export type LoadMode = "safe" | "live";

/** Paraphrases that hit at the production threshold. The known false miss is left out. */
export const SEMANTIC_PAIRS = [
  { cached: "What is the capital of France?", query: "Which city is the capital of France?" },
  { cached: "What is Redis?", query: "Can you explain what Redis is?" },
  { cached: "How does binary search work?", query: "Explain binary search." },
  { cached: "What causes rain?", query: "Why does rain happen?" },
  { cached: "Who is the president of France?", query: "Which person is the president of France?" },
] as const;

export type PlannedRequest = { kind: "chat"; message: string } | { kind: "health" };

export type LoadConfig = {
  mode: LoadMode;
  scenario: ScenarioName | "all";
  concurrency: number;
  requests: number | undefined;
  durationMs: number | undefined;
  allowLlm: boolean;
  maxLlmCalls: number;
  url: string;
  workingSet: number;
  outPath: string | undefined;
};

export class LoadPlanError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LoadPlanError";
  }
}

const DEFAULT_REQUESTS = 50;
const DEFAULT_CONCURRENCY = 8;
const DEFAULT_MAX_LLM_CALLS = 25;
const DEFAULT_WORKING_SET = 16;
const DEFAULT_URL = "http://127.0.0.1:3001";

export function parseLoadArgs(argv: readonly string[]): LoadConfig {
  let mode: LoadMode = "safe";
  let scenario: LoadConfig["scenario"] = "all";
  let concurrency = DEFAULT_CONCURRENCY;
  let requests: number | undefined = DEFAULT_REQUESTS;
  let durationMs: number | undefined;
  let allowLlm = false;
  let maxLlmCalls = DEFAULT_MAX_LLM_CALLS;
  let url = DEFAULT_URL;
  let workingSet = DEFAULT_WORKING_SET;
  let outPath: string | undefined;
  let requestsSet = false;

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === undefined) {
      continue;
    }
    if (token === "--help" || token === "-h") {
      throw new LoadPlanError("help");
    }
    const [flag, inline] = splitFlag(token);
    const value = inline ?? (needsValue(flag) ? readValue(argv, index) : undefined);
    if (inline === undefined && needsValue(flag)) {
      index += 1;
    }
    switch (flag) {
      case "--mode":
        mode = readMode(value);
        break;
      case "--scenario":
        scenario = readScenario(value);
        break;
      case "--concurrency":
        concurrency = readInteger(value, "--concurrency", 1, 256);
        break;
      case "--requests":
        requests = readInteger(value, "--requests", 1, 100_000);
        requestsSet = true;
        break;
      case "--duration":
        durationMs = readDuration(value);
        break;
      case "--allow-llm":
        allowLlm = true;
        break;
      case "--max-llm-calls":
        maxLlmCalls = readInteger(value, "--max-llm-calls", 0, 100_000);
        break;
      case "--url":
        url = readUrl(value);
        break;
      case "--working-set":
        workingSet = readInteger(value, "--working-set", 1, 100);
        break;
      case "--out":
        outPath = readText(value, "--out");
        break;
      default:
        throw new LoadPlanError(`Unknown argument ${flag}. Run with --help.`);
    }
  }

  if (durationMs !== undefined && !requestsSet) {
    requests = undefined;
  }

  return { mode, scenario, concurrency, requests, durationMs, allowLlm, maxLlmCalls, url, workingSet, outPath };
}

export function selectScenarios(config: LoadConfig): { run: ScenarioName[]; skipped: Array<{ scenario: ScenarioName; reason: string }> } {
  const requested = config.scenario === "all" ? [...LOAD_SCENARIOS] : [config.scenario];
  const run: ScenarioName[] = [];
  const skipped: Array<{ scenario: ScenarioName; reason: string }> = [];
  for (const scenario of requested) {
    const reason = blockReason(config, scenario);
    if (reason && config.scenario === "all") {
      skipped.push({ scenario, reason });
      continue;
    }
    if (reason) {
      throw new LoadPlanError(reason);
    }
    assertBudget(config, scenario);
    run.push(scenario);
  }
  if (run.length === 0) {
    throw new LoadPlanError("Every scenario was skipped. Pass --allow-llm to include Gemini traffic, or use --mode=safe.");
  }
  return { run, skipped };
}

export function plannedLlmCalls(scenario: ScenarioName, requests: number, workingSet: number): { warmup: number; measured: number } {
  switch (scenario) {
    case "exact-hit":
      return { warmup: 1, measured: 0 };
    case "semantic-hit":
      return { warmup: SEMANTIC_PAIRS.length, measured: 0 };
    case "miss":
      return { warmup: 0, measured: requests };
    case "redis":
      return { warmup: workingSet, measured: 0 };
    case "mixed":
      return { warmup: 1 + SEMANTIC_PAIRS.length, measured: countMixedMisses(requests) };
  }
}

export function warmupRequests(scenario: ScenarioName, runId: string, workingSet: number): PlannedRequest[] {
  switch (scenario) {
    case "exact-hit":
      return [{ kind: "chat", message: exactQuestion(runId) }];
    case "semantic-hit":
      return SEMANTIC_PAIRS.map((pair) => chat(pair.cached));
    case "miss":
      return [];
    case "redis":
      return Array.from({ length: workingSet }, (_, slot) => ({ kind: "chat", message: redisQuestion(runId, slot) }));
    case "mixed":
      return [chat(exactQuestion(runId)), ...SEMANTIC_PAIRS.map((pair) => chat(pair.cached))];
  }
}

export function measuredRequest(scenario: ScenarioName, runId: string, index: number, workingSet: number): PlannedRequest {
  switch (scenario) {
    case "exact-hit":
      return { kind: "chat", message: exactQuestion(runId) };
    case "semantic-hit":
      return { kind: "chat", message: SEMANTIC_PAIRS[index % SEMANTIC_PAIRS.length]?.query ?? SEMANTIC_PAIRS[0].query };
    case "miss":
      return { kind: "chat", message: missQuestion(runId, "miss", index) };
    case "redis":
      return { kind: "chat", message: redisQuestion(runId, index % workingSet) };
    case "mixed":
      return mixedRequest(runId, index);
  }
}

export function helpText(): string {
  return [
    "Load-test the Semantic LLM Cache API.",
    "",
    "Safe mode is the default. It starts a local server with a stub LLM, so Gemini is not called.",
    "Live mode sends traffic to a running API. Miss, mixed, and Redis working-set scenarios need --allow-llm.",
    "",
    "pnpm load",
    "pnpm load -- --scenario=exact-hit --concurrency=16 --requests=200",
    "pnpm load -- --mode=live --scenario=exact-hit --requests=100",
    "pnpm load -- --mode=live --scenario=miss --allow-llm --requests=10 --max-llm-calls=10",
    "",
    "--mode=safe|live          Default safe.",
    "--scenario=NAME           exact-hit, semantic-hit, miss, redis, mixed, or all.",
    "--concurrency=N           Workers. Default 8.",
    "--requests=N              Measured requests. Default 50. Omit when using only --duration.",
    "--duration=10s            Measured window. Without --requests, stop at this time. With both, stop at whichever comes first.",
    "--allow-llm               Required before live traffic that is meant to call Gemini.",
    "--max-llm-calls=N         Live ceiling, including warmup. Default 25.",
    "--url=URL                 Live API. Default http://127.0.0.1:3001.",
    "--working-set=N           Distinct Redis keys for the redis scenario. Default 16.",
    "--out=FILE                Write the JSON report to this path.",
  ].join("\n");
}

function blockReason(config: LoadConfig, scenario: ScenarioName): string | undefined {
  if (config.mode === "safe") {
    return undefined;
  }
  if ((scenario === "miss" || scenario === "mixed") && config.requests === undefined) {
    return `${scenario} against a live API needs --requests so the number of Gemini calls stays bounded.`;
  }
  if (scenario === "miss" || scenario === "mixed" || scenario === "redis") {
    if (!config.allowLlm) {
      return `${scenario} calls Gemini for new questions. Pass --allow-llm, or use --mode=safe.`;
    }
  }
  return undefined;
}

function assertBudget(config: LoadConfig, scenario: ScenarioName): void {
  if (config.mode !== "live") {
    return;
  }
  const requests = config.requests ?? 0;
  const planned = plannedLlmCalls(scenario, requests, config.workingSet);
  const total = planned.warmup + planned.measured;
  if (total > config.maxLlmCalls) {
    throw new LoadPlanError(
      `${scenario} can call Gemini ${total} times, which is above --max-llm-calls=${config.maxLlmCalls}.`,
    );
  }
}

function mixedRequest(runId: string, index: number): PlannedRequest {
  const slot = index % 10;
  if (slot < 5) {
    return { kind: "chat", message: exactQuestion(runId) };
  }
  if (slot < 8) {
    const pair = SEMANTIC_PAIRS[(index - 5) % SEMANTIC_PAIRS.length] ?? SEMANTIC_PAIRS[0];
    return { kind: "chat", message: pair.query };
  }
  return { kind: "chat", message: missQuestion(runId, "mixed", index) };
}

function countMixedMisses(requests: number): number {
  let misses = 0;
  for (let index = 0; index < requests; index += 1) {
    if (index % 10 >= 8) {
      misses += 1;
    }
  }
  return misses;
}

function chat(message: string): PlannedRequest {
  return { kind: "chat", message };
}

function exactQuestion(runId: string): string {
  return `Load exact ${runId}`;
}

function redisQuestion(runId: string, slot: number): string {
  return `Load redis ${runId} ${slot}`;
}

function missQuestion(runId: string, label: string, index: number): string {
  return `Load ${label} ${runId} ${index}`;
}

function splitFlag(token: string): [string, string | undefined] {
  const equals = token.indexOf("=");
  if (!token.startsWith("--") || equals === -1) {
    return [token, undefined];
  }
  return [token.slice(0, equals), token.slice(equals + 1)];
}

function needsValue(flag: string): boolean {
  return flag !== "--allow-llm" && flag !== "--help" && flag !== "-h";
}

function readValue(argv: readonly string[], index: number): string {
  const flag = argv[index] ?? "";
  const value = argv[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new LoadPlanError(`${flag} needs a value.`);
  }
  return value;
}

function readMode(value: string | undefined): LoadMode {
  if (value === "safe" || value === "live") {
    return value;
  }
  throw new LoadPlanError("--mode must be safe or live.");
}

function readScenario(value: string | undefined): LoadConfig["scenario"] {
  if (value === "all" || isScenario(value)) {
    return value;
  }
  throw new LoadPlanError("--scenario must be exact-hit, semantic-hit, miss, redis, mixed, or all.");
}

function isScenario(value: string | undefined): value is ScenarioName {
  return LOAD_SCENARIOS.some((scenario) => scenario === value);
}

function readInteger(value: string | undefined, flag: string, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new LoadPlanError(`${flag} must be an integer from ${min} to ${max}.`);
  }
  return parsed;
}

function readDuration(value: string | undefined): number {
  const match = /^(\d+)(ms|s|m)?$/.exec(value ?? "");
  const amount = Number(match?.[1]);
  const unit = match?.[2] ?? "s";
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new LoadPlanError("--duration must be a positive number of ms, s, or m.");
  }
  const scale = unit === "ms" ? 1 : unit === "m" ? 60_000 : 1_000;
  return amount * scale;
}

function readUrl(value: string | undefined): string {
  const text = readText(value, "--url").replace(/\/$/, "");
  if (!text.startsWith("http://") && !text.startsWith("https://")) {
    throw new LoadPlanError("--url must start with http:// or https://.");
  }
  return text;
}

function readText(value: string | undefined, flag: string): string {
  const text = value?.trim() ?? "";
  if (text.length === 0) {
    throw new LoadPlanError(`${flag} needs a value.`);
  }
  return text;
}
