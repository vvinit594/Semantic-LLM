# Deployment

This prepares the web app and the API to run in production. It does not deploy them, and it does not change cache decisions, the 0.85 threshold, the safety guards, or Gemini retries.

Run two services:

- The Next.js app serves the chat, dashboard, and cache explorer. It has no Gemini key and no Redis URL.
- The Fastify API serves `POST /api/chat`, metrics, the benchmark, the cache explorer, and `GET /health`. It holds `GEMINI_API_KEY` and `REDIS_URL`.

Redis is a separate managed service. The local `docker-compose.yml` file is only for development.

## Why the API is a container

Semantic hits embed the question on the API with `onnx-community/all-MiniLM-L6-v2-ONNX` through Transformers.js and `onnxruntime-node`. That stack needs three things a serverless function does not provide:

- A glibc Linux process. The published ONNX Runtime build does not run on Alpine.
- The ONNX weights on disk, then the model kept in memory. A cold start would download or reload it, and a miss during that window calls Gemini.
- A process that stays up. The extractor is loaded once and reused.

The API image is `node:22-bookworm-slim`. The build runs `apps/api/src/prefetch-embeddings.ts`, which loads the same model the API uses and stores the weights in the image. Startup does not pass a quantized dtype. The image skips the optional CUDA download and uses the CPU build shipped with `onnxruntime-node`. Give the API at least 1 GB of memory. 2 GB is safer.

Do not deploy the API to a platform that only runs short-lived or serverless functions. A long-running container on a VM, or a container host that keeps one instance warm, is the setup this image is built for.

## Redis

The cache needs Redis Stack, or Redis with RediSearch and RedisJSON. The vector index is created on database 0. Plain Redis, a Redis REST proxy, and a managed Redis service without the Search module cannot serve semantic hits.

Use a `redis://` or `rediss://` URL from the provider. Put it in `REDIS_URL` on the API only. The API creates `idx:semantic` on first use. Do not mount a custom `redis.conf`, and do not point the URL at a database other than 0.

## Secrets and origins

| Name | Where | Notes |
| --- | --- | --- |
| `GEMINI_API_KEY` | API runtime | Required for a cache miss. Missing key: the API stays up and chat returns 503. |
| `REDIS_URL` | API runtime | Managed Redis Stack URL. Never send it to the browser. |
| `GEMINI_MODEL` | API runtime | Optional. Default `gemini-3.8-flash`. |
| `WEB_ORIGIN` | API runtime | Exact public origin of the web app, such as `https://cache.example.com`. |
| `HOST` | API runtime | `0.0.0.0` in the container. Local development stays on `127.0.0.1`. |
| `PORT` | API runtime | The platform port. The image defaults to 3001. |
| `NEXT_PUBLIC_API_URL` | Web build | Public API origin. It is baked into the browser bundle. It is not a secret. |

`CACHE_TTL_SECONDS`, `SEMANTIC_SIMILARITY_THRESHOLD`, and `SEMANTIC_TOP_K` keep their current defaults. Leave the threshold at 0.85 unless you intend to change a measured decision.

Do not copy `.env` into an image. Set the variables in the host. Startup logs redact `GEMINI_API_KEY` and `REDIS_URL` when those values appear in an error message.

## Health and shutdown

`GET /health` still reports Redis as `status` and `redis`. When the API process is running, the body also includes `embeddings`: `loading`, `ok`, or `error`. The model is loaded before the port opens. If that load fails, the process still serves chat and semantic lookup falls through to Gemini, which is the existing failure path. The image health check requires both `redis` and `embeddings` to be `ok`, so a platform will not send traffic to a container whose model did not load.

`SIGTERM` and `SIGINT` close the HTTP server and the Redis client.

## Build the images

From the repo root. Docker Desktop has to be running. These commands build images. They do not publish them.

```powershell
docker build -f deploy/api.Dockerfile -t semantic-llm-api .
docker build -f deploy/web.Dockerfile -t semantic-llm-web --build-arg NEXT_PUBLIC_API_URL=https://api.example.com .
```

Replace `https://api.example.com` with the real public API origin. Rebuild the web image if that origin changes.

`deploy/docker-compose.yml` starts the web and API containers. It does not start Redis. Export the variables in the shell first, then build:

```powershell
$env:GEMINI_API_KEY = "<the key>"
$env:REDIS_URL = "rediss://<user>:<password>@<host>:6379"
$env:WEB_ORIGIN = "https://cache.example.com"
$env:NEXT_PUBLIC_API_URL = "https://api.example.com"
docker compose -f deploy/docker-compose.yml build
```

Do not commit the shell history or a filled-in env file. Local Redis from `pnpm redis:up` is still the development database. From a container on Docker Desktop, that database is `redis://host.docker.internal:6379`, not `localhost`.

## Check a local image

Map a port other than 3001 if the development API is already running.

```powershell
docker run --rm -p 3011:3001 -e HOST=0.0.0.0 -e PORT=3001 -e GEMINI_API_KEY=unused -e REDIS_URL=redis://host.docker.internal:6379 -e WEB_ORIGIN=http://127.0.0.1:3000 semantic-llm-api
```

`GET http://127.0.0.1:3011/health` should show `redis: "ok"` and `embeddings: "ok"` once the model is in memory. `unused` is not a Gemini key. A real miss needs the real key, and that call costs money. Stop the container when you are done. This is not a production deploy.
