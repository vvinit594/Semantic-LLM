import { runBenchmark } from "./run";

runBenchmark().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "benchmark failed";
  console.error(message);
  process.exitCode = 1;
});
