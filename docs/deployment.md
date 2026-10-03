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

A native Vercel Node function, or any Alpine image, cannot load this model. `Dockerfile.vercel` is the container-image path: the same Debian image and prefetch, served by Vercel Functions. `deploy/api.Dockerfile` remains the long-running VM image. Vercel scales an idle container to zero, so a cold start loads MiniLM from the image before the port opens. That load does not download the weights again.

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
| `HOST` | API runtime | `0.0.0.0` in a container. Local development stays on `127.0.0.1`. |
| `PORT` | API runtime | Local development and `deploy/api.Dockerfile` use 3001. The process reads `process.env.PORT` and falls back to 3001 only when `PORT` is unset. |
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

## Vercel container

`Dockerfile.vercel` at the repo root is the API image for Vercel Container Images. `vercel.json` points the `api` service at that file and sends every path to it. This project on Vercel is the API. The Next.js app is not part of that service. The image does not use Docker Compose, and it does not run Redis.

Vercel builds the Dockerfile, stores the image in Vercel Container Registry, and runs it as a Function. The container listens on `0.0.0.0` and `process.env.PORT`. The image sets `PORT=80`, which is the port Vercel routes to when the project does not override `PORT`. A `PORT` value in the Vercel project replaces that default. Do not set `PORT=3001` on Vercel. Local `pnpm dev:api` is unchanged and still uses 3001.

Set these in the Vercel project environment, not in the image and not in git:

| Name | Required | Value |
| --- | --- | --- |
| `GEMINI_API_KEY` | Yes, for a miss | The Gemini key. Mark it sensitive. A missing key leaves the API up and chat returns 503. |
| `REDIS_URL` | Yes | `rediss://` URL of an external Redis Stack, or Redis with RediSearch and RedisJSON, database 0. |
| `WEB_ORIGIN` | When the site exists | The exact public origin of the frontend, such as `https://cache.example.com`. Leave it unset until that URL is known. Local origins stay allowed. |
| `PORT` | Only to override | Leave unset to use the image port 80. Set it only if the Vercel project routes the container to a different port. |
| `GEMINI_MODEL` | No | Default `gemini-3.8-flash`. |
| `CACHE_TTL_SECONDS` | No | Default 86400. |
| `SEMANTIC_SIMILARITY_THRESHOLD` | No | Leave at 0.85. |
| `SEMANTIC_TOP_K` | No | Default 5. |

`HOST` is already `0.0.0.0` in the image. Do not point `REDIS_URL` at `localhost`. The container cannot see a Redis running on your laptop. Managed Redis must allow the Vercel Function region. Secure Compute and static IPs are not available for container images, so the Redis provider has to accept the Function's outbound addresses or a public TLS endpoint.

Give the Function at least 1 GB of memory. 2 GB is safer for MiniLM. Hobby allows up to 2 GB. Pro and Enterprise allow up to 4 GB. The standard Function bundle limit is 250 MB uncompressed. A local build of this image was 3.28 GB, which is inside the Container Registry limit of 15 GB and above the standard Function bundle limit. If the deployment rejects the size, enable Vercel's larger Function bundle limit for the project.

An idle production instance scales down after 5 minutes. A preview instance scales down after 30 seconds. Vercel then sends `SIGTERM` and waits 30 seconds. The API already closes Fastify and Redis on that signal. The next request starts a new container, which loads MiniLM from the image before it accepts traffic. Expect that pause on a cold start. The similarity threshold and the embedding model are the same ones the local API uses.

Deploy by connecting the Git repository or by running `vercel deploy` from the repo root with the Vercel CLI. The frontend's `NEXT_PUBLIC_API_URL` is the public origin Vercel assigns this project, and it is set when the web app is built, not in this image.

Check the image locally on a port other than 80:

```powershell
docker build -f Dockerfile.vercel -t semantic-llm-api:vercel .
docker run --rm -p 8080:8080 -e PORT=8080 -e GEMINI_API_KEY=unused -e REDIS_URL=redis://host.docker.internal:6379 -e WEB_ORIGIN=http://127.0.0.1:3000 semantic-llm-api:vercel
```

`GET http://127.0.0.1:8080/health` should show `redis: "ok"` and `embeddings: "ok"`. `unused` is not a Gemini key. Stop the container when you are done.
