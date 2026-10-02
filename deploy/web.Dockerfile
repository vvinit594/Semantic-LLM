# Next.js standalone image. NEXT_PUBLIC_API_URL is baked in at build time.
# It is the public API URL, not a secret.
FROM node:22-bookworm-slim AS build

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@10.20.0 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/web/package.json apps/web/package.json
COPY apps/api/package.json apps/api/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/cache/package.json packages/cache/package.json
COPY packages/decision/package.json packages/decision/package.json
COPY packages/embeddings/package.json packages/embeddings/package.json
COPY packages/evaluation/package.json packages/evaluation/package.json
COPY packages/llm/package.json packages/llm/package.json
COPY packages/query/package.json packages/query/package.json

RUN pnpm install --frozen-lockfile --filter @semantic-llm/web...

COPY apps/web apps/web
COPY packages/shared packages/shared

ARG NEXT_PUBLIC_API_URL
RUN test -n "$NEXT_PUBLIC_API_URL" || (echo "Set NEXT_PUBLIC_API_URL to the public API origin before building the web image." && exit 1)
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

RUN pnpm --filter @semantic-llm/web build

FROM node:22-bookworm-slim AS run

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static

USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
