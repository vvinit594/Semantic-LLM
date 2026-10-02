import { measuredRequest, warmupRequests, type LoadMode, type PlannedRequest, type ScenarioName } from "./plan";
import { summarize, type LoadObservation, type LoadSample, type ScenarioReport } from "./stats";

export async function runScenario(options: {
  scenario: ScenarioName;
  mode: LoadMode;
  concurrency: number;
  requests: number | undefined;
  durationMs: number | undefined;
  runId: string;
  workingSet: number;
  maxLlmCalls: number;
  send: (request: PlannedRequest) => Promise<LoadObservation>;
  messages: Set<string>;
}): Promise<ScenarioReport> {
  if (options.requests === undefined && options.durationMs === undefined) {
    throw new Error("A load scenario needs a request count or a duration.");
  }
  let warmupLlmCalls = 0;
  for (const request of warmupRequests(options.scenario, options.runId, options.workingSet)) {
    remember(options.messages, request);
    const observation = await sendOne(options.send, request);
    if (!observation.ok) {
      throw new Error(`${options.scenario} warmup failed before the measured window.`);
    }
    if (observation.cached === false) {
      warmupLlmCalls += 1;
    }
  }

  const samples: LoadSample[] = [];
  let cursor = 0;
  let measuredLlmCalls = 0;
  let stoppedEarly = false;
  const started = performance.now();

  async function worker(): Promise<void> {
    for (;;) {
      if (stoppedEarly) {
        return;
      }
      if (options.durationMs !== undefined && performance.now() - started >= options.durationMs) {
        return;
      }
      const index = cursor;
      if (options.requests !== undefined && index >= options.requests) {
        return;
      }
      cursor += 1;
      const request = measuredRequest(options.scenario, options.runId, index, options.workingSet);
      remember(options.messages, request);
      const requestStarted = performance.now();
      const observation = await sendOne(options.send, request);
      samples.push({
        ...observation,
        kind: request.kind,
        latencyMs: performance.now() - requestStarted,
      });
      if (request.kind === "chat" && !(observation.ok && observation.cached === true)) {
        measuredLlmCalls += 1;
        if (options.mode === "live" && warmupLlmCalls + measuredLlmCalls >= options.maxLlmCalls) {
          stoppedEarly = true;
        }
      }
    }
  }

  await Promise.all(Array.from({ length: options.concurrency }, () => worker()));
  return summarize({
    scenario: options.scenario,
    mode: options.mode,
    concurrency: options.concurrency,
    samples,
    elapsedMs: performance.now() - started,
    warmupLlmCalls,
    measuredLlmCalls,
    stoppedEarly,
  });
}

async function sendOne(
  send: (request: PlannedRequest) => Promise<LoadObservation>,
  request: PlannedRequest,
): Promise<LoadObservation> {
  try {
    return await send(request);
  } catch {
    return { ok: false, cached: null, match: null };
  }
}

function remember(messages: Set<string>, request: PlannedRequest): void {
  if (request.kind === "chat") {
    messages.add(request.message);
  }
}
