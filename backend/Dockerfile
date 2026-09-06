# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim AS dependencies
WORKDIR /app
# Prisma's query engine is dynamically linked against OpenSSL, which the slim
# image does not carry. Without it `prisma generate` picks the wrong engine
# target and the client fails at its first query — a runtime failure from a
# build that succeeded, so it has to be installed before generate, not after.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
COPY backend/package.json backend/package-lock.json ./
RUN npm ci
COPY backend/prisma ./prisma
RUN npx prisma generate

FROM dependencies AS build
COPY backend/tsconfig.json ./
COPY backend/src ./src
RUN npm run build

# Run this target as a one-off release job before starting the new API image:
# docker build --target migrate -f backend/Dockerfile -t leornian-migrate .
FROM dependencies AS migrate
CMD ["npx", "prisma", "migrate", "deploy"]

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
# The runtime is a fresh slim image, not derived from `dependencies`, so it needs
# OpenSSL of its own: the generated client is copied in, but the shared library
# it loads at query time is not.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
COPY backend/package.json backend/package-lock.json ./
COPY --from=dependencies /app/node_modules ./node_modules
RUN npm prune --omit=dev --omit=optional
COPY --from=build /app/dist ./dist
COPY --from=dependencies /app/prisma ./prisma
USER node
EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||5000)+'/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "dist/server.js"]
