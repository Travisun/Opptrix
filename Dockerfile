# Opptrix self-hosted image (single-user instance)
# Build: docker build -t opptrix:local .
# Prefer correctness over minimal size for v1 — glibc (bookworm), NOT alpine.
#
# Native modules (better-sqlite3, duckdb, sharp, onnxruntime-node, @lancedb/lancedb,
# node-llama-cpp) are compiled/installed against linux glibc Node 24 in the build stage.
#
# Runtime toolchain:
#   - Default PATH Node: official node:24-bookworm-slim (stable)
#   - Optional track: nvm under /opt/nvm installs Node 22 LTS (does NOT replace PATH default)
#   - Python: bookworm python3 (3.11) + pip + venv + dev headers
#
# Build mirrors (CN / foreign) — pass via --build-arg or Compose:
#   NODE_IMAGE_PREFIX  e.g. docker.1ms.run/library/  (must end with /)
#   NPM_REGISTRY       e.g. https://registry.npmmirror.com
#   APT_MIRROR         e.g. mirrors.aliyun.com  (host only, no scheme)
#   MIRROR_AUTO=1      probe npmmirror / npmjs / aliyun / debian (scripts/docker-select-mirrors.mjs)
# Empty = Docker Hub + registry.npmjs.org + deb.debian.org (foreign default; CI uses this).
#
# Models: this image is intentionally model-free. Do NOT download SenseVoice / E5 /
# RapidOCR / HY-MT during docker build. Models are fetched via product onboarding or
# optional OPPTRIX_FETCH_MODELS_ON_START=1 at container start.

ARG NODE_VERSION=24
ARG NODE_IMAGE_PREFIX=
ARG MIRROR_AUTO=

# ── Stage: build ─────────────────────────────────────────────────────────────
FROM ${NODE_IMAGE_PREFIX}node:${NODE_VERSION}-bookworm AS build

ARG APT_MIRROR=
ARG NPM_REGISTRY=
ARG NODE_VERSION=
ARG MIRROR_AUTO=
ARG NODE_IMAGE_PREFIX=

WORKDIR /app

COPY scripts/docker-select-mirrors.mjs /tmp/docker-select-mirrors.mjs

# Optional Debian / npm mirrors (explicit build-args or MIRROR_AUTO probe)
RUN set -eu; \
    _APT="${APT_MIRROR}"; \
    _NPM="${NPM_REGISTRY}"; \
    _PREFIX="${NODE_IMAGE_PREFIX}"; \
    if [ "${MIRROR_AUTO}" = "1" ] && [ -z "${_APT}" ] && [ -z "${_NPM}" ] && [ -z "${_PREFIX}" ]; then \
      eval "$(node /tmp/docker-select-mirrors.mjs --build-eval)"; \
      _APT="${APT_MIRROR:-}"; \
      _NPM="${NPM_REGISTRY:-}"; \
      echo "[opptrix-build] MIRROR_AUTO profile=${OPPTRIX_MIRROR_PROFILE:-unknown} APT=${_APT} NPM=${_NPM}"; \
    fi; \
    if [ -n "${_APT}" ]; then \
      find /etc/apt -type f \( -name '*.list' -o -name '*.sources' \) -print0 \
        | xargs -0 -r sed -i \
          -e "s|deb.debian.org|${_APT}|g" \
          -e "s|security.debian.org|${_APT}|g"; \
      echo "[opptrix-build] APT_MIRROR=${_APT}"; \
    fi \
  && apt-get update \
  && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    python3-venv \
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
RUN set -eu; \
    _NPM="${NPM_REGISTRY}"; \
    if [ "${MIRROR_AUTO}" = "1" ] && [ -z "${_NPM}" ]; then \
      eval "$(node /tmp/docker-select-mirrors.mjs --build-eval)"; \
      _NPM="${NPM_REGISTRY:-}"; \
    fi; \
    if [ -n "${_NPM}" ]; then \
      echo "[opptrix-build] NPM_REGISTRY=${_NPM}"; \
      npm config set registry "${_NPM}"; \
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
ARG MIRROR_AUTO=
ARG OPPTRIX_BASE_VERSION=
ARG OPPTRIX_RELEASE_TAG=

FROM ${NODE_IMAGE_PREFIX}node:${NODE_VERSION}-bookworm-slim AS runtime

ARG APT_MIRROR=
ARG MIRROR_AUTO=
ARG OPPTRIX_BASE_VERSION=
ARG OPPTRIX_RELEASE_TAG=

WORKDIR /app

COPY scripts/docker-select-mirrors.mjs /tmp/docker-select-mirrors.mjs

# Base tools for Agent (opptrix_run): system Node 24 (image default) + nvm Node 22 +
# system Python/shell/git. build-essential retained for occasional native npm at runtime.
RUN set -eu; \
    _APT="${APT_MIRROR}"; \
    if [ "${MIRROR_AUTO}" = "1" ] && [ -z "${_APT}" ]; then \
      eval "$(node /tmp/docker-select-mirrors.mjs --build-eval)"; \
      _APT="${APT_MIRROR:-}"; \
      echo "[opptrix-build] MIRROR_AUTO profile=${OPPTRIX_MIRROR_PROFILE:-unknown} APT=${_APT}"; \
    fi; \
    if [ -n "${_APT}" ]; then \
      find /etc/apt -type f \( -name '*.list' -o -name '*.sources' \) -print0 \
        | xargs -0 -r sed -i \
          -e "s|deb.debian.org|${_APT}|g" \
          -e "s|security.debian.org|${_APT}|g"; \
    fi \
  && apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    git \
    python3 \
    python3-pip \
    python3-venv \
    python3-dev \
    build-essential \
    libstdc++6 \
    libgomp1 \
    tini \
    bash \
  && rm -rf /var/lib/apt/lists/* \
  && python3 -m pip install --break-system-packages --no-cache-dir pip \
  && ln -sf /usr/bin/python3 /usr/local/bin/python \
  && ln -sf /usr/bin/pip3 /usr/local/bin/pip

# nvm optional track — default PATH stays official Node 24 from the base image.
ENV NVM_DIR=/opt/nvm
RUN mkdir -p "$NVM_DIR" \
  && curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.2/install.sh \
    | NVM_DIR="$NVM_DIR" PROFILE=/dev/null bash \
  && . "$NVM_DIR/nvm.sh" \
  && nvm install 22 \
  && nvm cache clear \
  && printf '%s\n' \
    'export NVM_DIR="/opt/nvm"' \
    '[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"' \
    > /etc/profile.d/opptrix-nvm.sh

# Single-user self-host: run as root so named/bind volumes are writable without
# host UID mapping. Agent commands drop to opptrix-agent (DAC). Harden with
# reverse-proxy auth + claim account (see SELF-HOSTING).
# /app = immutable seed tree; /opptrix/system (or /system) = hot-update slots.
# Fixed uid/gid for stable volume ownership across image rebuilds.
RUN groupadd --gid 10001 opptrix-agent \
  && useradd --uid 10001 --gid 10001 --home-dir /opptrix/workspace --shell /usr/sbin/nologin \
    --no-create-home opptrix-agent \
  && mkdir -p \
    /opptrix/private \
    /opptrix/workspace \
    /opptrix/mounts \
    /opptrix/models \
    /opptrix/system \
    /data /data/mounts /models /system \
  && chown -R opptrix-agent:opptrix-agent /opptrix/workspace /opptrix/mounts \
  && chmod 2770 /opptrix/workspace /opptrix/mounts \
  && chmod 700 /opptrix/private /opptrix/system

# Built monorepo tree (prefer correctness: keep workspace layout so Node resolution works)
COPY --from=build /app /app

RUN chmod +x /app/scripts/docker-entrypoint.sh \
  && chmod +x /app/scripts/system-boot.mjs \
  && chmod +x /app/scripts/opptrix-node-supervisor.mjs \
  && chmod +x /app/scripts/docker-select-mirrors.mjs

ENV NODE_ENV=production \
  STOCK_RESEARCH_HOST=0.0.0.0 \
  STOCK_RESEARCH_PORT=8711 \
  SERVE_UI=1 \
  OPPTRIX_HOME=/opptrix \
  OPPTRIX_DATA_DIR=/opptrix/private \
  OPPTRIX_AGENT_WORKSPACE_DIR=/opptrix/workspace \
  OPPTRIX_MOUNTS_DIR=/opptrix/mounts \
  OPPTRIX_MODELS_DIR=/opptrix/models \
  OPPTRIX_SYSTEM_DIR=/opptrix/system \
  OPPTRIX_DOCKER=1 \
  OPPTRIX_AGENT_SANDBOX=off \
  OPPTRIX_AGENT_USER=opptrix-agent \
  OPPTRIX_AGENT_UID=10001 \
  OPPTRIX_AGENT_GID=10001 \
  OPPTRIX_SEED_ROOT=/app \
  UI_DIST_PATH=/app/client-ui/dist \
  OPPTRIX_LLM_DIR=/opptrix/models/llms \
  OPPTRIX_E5_BUNDLED_DIR=/opptrix/models/llms/multilingual-e5-small \
  OPPTRIX_RAPIDOCR_MODEL_DIR=/opptrix/models/llms/rapidocr-ppocrv4-mobile \
  OPPTRIX_RAPIDOCR_BUNDLED_DIR=/opptrix/models/llms/rapidocr-ppocrv4-mobile \
  OPPTRIX_SENSEVOICE_BUNDLED_DIR=/opptrix/models/sensevoice \
  OPPTRIX_WITH_MODELS=1 \
  OPPTRIX_BASE_VERSION=${OPPTRIX_BASE_VERSION} \
  OPPTRIX_RELEASE_TAG=${OPPTRIX_RELEASE_TAG}
# Runtime release identity may be overridden by Compose env (OPPTRIX_APP_VERSION / CHANNEL / TAG)
# Entrypoint seeds /system from /app, then runs server from /system/boot (supervisor loop).

EXPOSE 8711

VOLUME ["/opptrix"]

ENTRYPOINT ["/usr/bin/tini", "--", "/app/scripts/docker-entrypoint.sh"]
CMD ["node", "apps/server/dist/index.js"]
