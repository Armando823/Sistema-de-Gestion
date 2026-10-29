# syntax=docker/dockerfile:1

ARG NODE_VERSION=22-slim
FROM node:${NODE_VERSION} AS frontend-build
WORKDIR /build/frontend
# Instala dependencias sin lockfile para resolver binarios nativos de Linux (rollup/esbuild).
COPY frontend/package.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

FROM node:${NODE_VERSION} AS server-deps
ENV NODE_ENV=production
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

FROM node:${NODE_VERSION} AS runtime
ENV NODE_ENV=production \
    PORT=3001 \
    STATIC_DIR=/app/frontend/dist \
    RUN_MIGRATIONS=true
WORKDIR /app
COPY --from=server-deps --chown=node:node /app/server/node_modules ./server/node_modules
COPY --chown=node:node server/package.json ./server/package.json
COPY --chown=node:node server/src ./server/src
COPY --chown=node:node server/migrations ./server/migrations
COPY --from=frontend-build --chown=node:node /build/frontend/dist ./frontend/dist
WORKDIR /app/server
USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "src/index.js"]
