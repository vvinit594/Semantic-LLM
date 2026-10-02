# Long-running API image. The local embedding model uses onnxruntime-node, which needs
# glibc and a process that stays up. Do not run this on Alpine or as a short-lived function.
FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@10.20.0 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/cache/package.json packages/cache/package.json
COPY packages/decision/package.json packages/decision/package.json
COPY packages/embeddings/package.json packages/embeddings/package.json
COPY packages/evaluation/package.json packages/evaluation/package.json
COPY packages/llm/package.json packages/llm/package.json
COPY packages/query/package.json packages/query/package.json
COPY packages/shared/package.json packages/shared/package.json

# Install before NODE_ENV=production so tsx, a devDependency, is present.
# Skip the optional CUDA download. The CPU build already in the npm package is what MiniLM uses.
ENV ONNXRUNTIME_NODE_INSTALL=skip
RUN pnpm install --frozen-lockfile --filter @semantic-llm/api...

COPY apps/api apps/api
COPY packages packages
COPY datasets datasets

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3001

# Cache the ONNX weights in the image so a new container does not download them.
RUN pnpm --filter @semantic-llm/api exec tsx src/prefetch-embeddings.ts \
  && chown -R node:node /app

USER node
EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=3 \
  CMD ["node", "--input-type=module", "-e", "const port=process.env.PORT??'3001'; const body=await (await fetch('http://127.0.0.1:'+port+'/health')).json(); if (body.redis!=='ok' || body.embeddings!=='ok') process.exit(1);"]

CMD ["pnpm", "--filter", "@semantic-llm/api", "start"]
