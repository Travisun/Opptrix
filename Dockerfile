# Opptrix self-hosted image (single-user instance)
# Build: docker build -t opptrix:local .
# Prefer correctness over minimal size for v1 — glibc (bookworm), NOT alpine.
#
# Native modules (better-sqlite3, duckdb, sharp, onnxruntime-node, @lancedb/lancedb,
# node-llama-cpp) are compiled/installed against linux glibc Node 24 in the build stage.

ARG NODE_VERSION=24

# ── Stage: build ─────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION}-bookworm AS build

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    build-essential \
    pkg-config \
    ca-certificates \
    curl \
  && rm -rf /var/lib/apt/lists/*

# Copy lockfile + manifests first for better layer reuse when possible.
COPY package.json package-lock.json ./
COPY packages ./packages
COPY apps ./apps
COPY client-ui ./client-ui
COPY scripts ./scripts
COPY example ./example
COPY icons ./icons
COPY docs ./docs
COPY README.md LICENSE ./

# Full workspace install (devDeps needed for TypeScript / Vite build)
ENV NODE_ENV=development
RUN npm ci

# packages + client-ui (SERVE_UI=1 serves client-ui/dist)
RUN npm run build

# Drop build-only tooling to shrink the tree copied into runtime
RUN npm prune --omit=dev

# ── Stage: runtime ───────────────────────────────────────────────────────────
FROM node:${NODE_VERSION}-bookworm-slim AS runtime

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    libstdc++6 \
    libgomp1 \
    tini \
  && rm -rf /var/lib/apt/lists/*

# Single-user self-host: run as root so named/bind volumes are writable without
# host UID mapping. Harden with reverse-proxy auth + claim account (see SELF-HOSTING).
RUN mkdir -p /data /data/mounts /models

# Built monorepo tree (prefer correctness: keep workspace layout so Node resolution works)
COPY --from=build /app /app

RUN chmod +x /app/scripts/docker-entrypoint.sh

ENV NODE_ENV=production \
  STOCK_RESEARCH_HOST=0.0.0.0 \
  STOCK_RESEARCH_PORT=8711 \
  SERVE_UI=1 \
  OPPTRIX_DATA_DIR=/data \
  UI_DIST_PATH=/app/client-ui/dist \
  OPPTRIX_LLM_DIR=/models/llms \
  OPPTRIX_E5_BUNDLED_DIR=/models/llms/multilingual-e5-small \
  OPPTRIX_RAPIDOCR_MODEL_DIR=/models/llms/rapidocr-ppocrv4-mobile \
  OPPTRIX_RAPIDOCR_BUNDLED_DIR=/models/llms/rapidocr-ppocrv4-mobile \
  OPPTRIX_SENSEVOICE_BUNDLED_DIR=/models/sensevoice \
  OPPTRIX_WITH_MODELS=1

EXPOSE 8711

VOLUME ["/data", "/models"]

ENTRYPOINT ["/usr/bin/tini", "--", "/app/scripts/docker-entrypoint.sh"]
CMD ["node", "apps/server/dist/index.js"]