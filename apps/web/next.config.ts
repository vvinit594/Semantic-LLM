import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: ["@semantic-llm/shared"],
  outputFileTracingRoot: join(dirname(fileURLToPath(import.meta.url)), "../.."),
};

export default nextConfig;
