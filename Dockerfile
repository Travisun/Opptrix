# Opptrix self-hosted image (single-user instance)
# Build: docker build -t opptrix:local .
# Prefer correctness over minimal size for v1 — glibc (bookworm), NOT alpine.
#
# Native modules (better-sqlite3, duckdb, sharp, onnxruntime-node, @lancedb/lancedb,
# node-llama-cpp) are compiled/installed against linux glibc Node 24 in the build stage.
#
# Build mirrors (CN / foreign) — pass via --build-arg or Compose:
#   NODE_IMAGE_PREFIX  e.g. docker.1ms.run/library/  (must end with /)
#   NPM_REGISTRY       e.g. https://registry.npmmirror.com
#   APT_MIRROR         e.g. mirrors.aliyun.com  (host only, no scheme)
# Empty = Docker Hub + registry.npmjs.org + deb.debian.org (foreign default).

ARG NODE_VERSION=24
ARG NODE_IMAGE_PREFIX=

# ── Stage: build ─────────────────────────────────────────────────────────────
FROM ${NODE_IMAGE_PREFIX}node:${NODE_VERSION}-bookworm AS build

ARG APT_MIRROR=
ARG NPM_REGISTRY=
ARG NODE_VERSION

WORKDIR /app

# Optional Debian mirror (bookworm uses deb822 *.sources and/or *.list)
RUN if [ -n "${APT_MIRROR}" ]; then \
      find /etc/apt -type f \( -name '*.list' -o -name '*.sources' \) -print0 \
        | xargs -0 -r sed -i \
          -e "s|deb.debian.org|${APT_MIRROR}|g" \
          -e "s|security.debian.org|${APT_MIRROR}|g"; \
      echo "[opptrix-build] APT_MIRROR=${APT_MIRROR}"; \
    fi \
  && apt-get update \
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
RUN if [ -n "${NPM_REGISTRY}" ]; then \
      echo "[opptrix-build] NPM_REGISTRY=${NPM_REGISTRY}"; \
      npm config set registry "${NPM_REGISTRY}"; \
    fi \
  && npm ci

# packages + client-ui (SERVE_UI=1 serves client-ui/dist)
RUN npm run build

# Drop build-only tooling to shrink the tree copied into runtime
RUN npm prune --omit=dev

# ── Stage: runtime ───────────────────────────────────────────────────────────
# Re-declare ARGs after FROM (build-args do not carry across stages).
ARG NODE_VERSION=24
ARG NODE_IMAGE_PREFIX=
FROM ${NODE_IMAGE_PREFIX}node:${NODE_VERSION}-bookworm-slim AS runtime

ARG APT_MIRROR=

WORKDIR /app

RUN if [ -n "${APT_MIRROR}" ]; then \
      find /etc/apt -type f \( -name '*.list' -o -name '*.sources' \) -print0 \
        | xargs -0 -r sed -i \
          -e "s|deb.debian.org|${APT_MIRROR}|g" \
          -e "s|security.debian.org|${APT_MIRROR}|g"; \
    fi \
  && apt-get update \
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
# Runtime release identity may be overridden by Compose env (OPPTRIX_APP_VERSION / CHANNEL / TAG)

EXPOSE 8711

VOLUME ["/data", "/models"]

ENTRYPOINT ["/usr/bin/tini", "--", "/app/scripts/docker-entrypoint.sh"]
CMD ["node", "apps/server/dist/index.js"]
