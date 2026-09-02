#!/bin/sh
# Opptrix Docker entrypoint — volumes, dual-user DAC, optional model fetch, system slot boot + supervisor.
#
# Models: image is model-free. By default we do NOT run docker-fetch-models.mjs on start
# (set OPPTRIX_FETCH_MODELS_ON_START=1 to restore legacy first-boot download). Product
# onboarding downloads models into models dir. OPPTRIX_SKIP_MODEL_FETCH=1 always skips.
#
# Mirrors: OPPTRIX_MIRROR_AUTO=1 probes registries and exports PIP_INDEX_URL / npm registry.
#
# Layout (preferred — OPPTRIX_HOME=/opptrix, single volume):
#   private/   → OPPTRIX_DATA_DIR (service-only 0700)
#   workspace/ → OPPTRIX_AGENT_WORKSPACE_DIR (opptrix-agent writable)
#   mounts/    → OPPTRIX_MOUNTS_DIR
#   models/    → OPPTRIX_MODELS_DIR (group-readable)
#   system/    → OPPTRIX_SYSTEM_DIR (service-only 0700)
#
# Legacy (no OPPTRIX_HOME): /data + /models + /system；workspace/mounts 仍在 data 下并 chown 给 agent。
#
# Agent isolation: service runs as root; opptrix_run spawns as opptrix-agent (DAC).
# umask 002 + setgid on workspace/mounts so root-created session dirs stay group-writable.
#
# Supervisor exit codes (server process):
#   42 — activate pending (if any), then restart
#   43 / 44 — soft restart without activate
#   other non-zero — log, backoff sleep, restart
#   0 — restart unless OPPTRIX_ONCE=1
set -eu

SEED_ROOT="${OPPTRIX_SEED_ROOT:-/app}"
AGENT_USER="${OPPTRIX_AGENT_USER:-opptrix-agent}"

if [ -n "${OPPTRIX_HOME:-}" ]; then
  HOME_ROOT="$OPPTRIX_HOME"
  DATA_DIR="${OPPTRIX_DATA_DIR:-$HOME_ROOT/private}"
  MODELS_DIR="${OPPTRIX_MODELS_DIR:-$HOME_ROOT/models}"
  SYSTEM_DIR="${OPPTRIX_SYSTEM_DIR:-$HOME_ROOT/system}"
  WORKSPACE_DIR="${OPPTRIX_AGENT_WORKSPACE_DIR:-$HOME_ROOT/workspace}"
  MOUNTS_DIR="${OPPTRIX_MOUNTS_DIR:-$HOME_ROOT/mounts}"
else
  DATA_DIR="${OPPTRIX_DATA_DIR:-/data}"
  MODELS_DIR="${OPPTRIX_MODELS_DIR:-/models}"
  SYSTEM_DIR="${OPPTRIX_SYSTEM_DIR:-/system}"
  WORKSPACE_DIR="${OPPTRIX_AGENT_WORKSPACE_DIR:-$DATA_DIR/agent-workspace}"
  MOUNTS_DIR="${OPPTRIX_MOUNTS_DIR:-$DATA_DIR/mounts}"
fi

mkdir -p "$DATA_DIR" "$MODELS_DIR" "$SYSTEM_DIR" "$WORKSPACE_DIR" "$MOUNTS_DIR" \
  "$MODELS_DIR/llms" \
  "$MODELS_DIR/llms/multilingual-e5-small" \
  "$MODELS_DIR/llms/rapidocr-ppocrv4-mobile" \
  "$MODELS_DIR/sensevoice"

# Default model layout (with-models):
#   models/llms/multilingual-e5-small/     → OPPTRIX_E5_BUNDLED_DIR
#   models/llms/rapidocr-ppocrv4-mobile/   → OPPTRIX_RAPIDOCR_MODEL_DIR / BUNDLED
#   models/llms/*.gguf                    → HY-MT offline translation (OPPTRIX_LLM_DIR)
#   models/sensevoice/                    → OPPTRIX_SENSEVOICE_BUNDLED_DIR (q8 + VAD)
export OPPTRIX_DATA_DIR="$DATA_DIR"
export OPPTRIX_SYSTEM_DIR="$SYSTEM_DIR"
export OPPTRIX_SEED_ROOT="$SEED_ROOT"
export OPPTRIX_DOCKER="${OPPTRIX_DOCKER:-1}"
# ESM apps resolve bare imports from $BOOT/node_modules; system-boot copies
# ABI packages from vendor into $BOOT/node_modules (see scripts/lib/runtime-vendor.mjs).
export OPPTRIX_VENDOR_NODE_MODULES="${OPPTRIX_VENDOR_NODE_MODULES:-/opt/opptrix/vendor/node_modules}"
export OPPTRIX_AGENT_WORKSPACE_DIR="$WORKSPACE_DIR"
export OPPTRIX_MOUNTS_DIR="$MOUNTS_DIR"
export OPPTRIX_LLM_DIR="${OPPTRIX_LLM_DIR:-$MODELS_DIR/llms}"
export OPPTRIX_E5_BUNDLED_DIR="${OPPTRIX_E5_BUNDLED_DIR:-$MODELS_DIR/llms/multilingual-e5-small}"
export OPPTRIX_RAPIDOCR_MODEL_DIR="${OPPTRIX_RAPIDOCR_MODEL_DIR:-$MODELS_DIR/llms/rapidocr-ppocrv4-mobile}"
export OPPTRIX_RAPIDOCR_BUNDLED_DIR="${OPPTRIX_RAPIDOCR_BUNDLED_DIR:-$MODELS_DIR/llms/rapidocr-ppocrv4-mobile}"
export OPPTRIX_SENSEVOICE_BUNDLED_DIR="${OPPTRIX_SENSEVOICE_BUNDLED_DIR:-$MODELS_DIR/sensevoice}"
if [ -n "${OPPTRIX_HOME:-}" ]; then
  export OPPTRIX_HOME
fi

# ── Dual-user DAC: private/system for service; workspace/mounts for opptrix-agent ──
AGENT_UID=""
AGENT_GID=""
if id "$AGENT_USER" >/dev/null 2>&1; then
  AGENT_UID="$(id -u "$AGENT_USER")"
  AGENT_GID="$(id -g "$AGENT_USER")"
  export OPPTRIX_AGENT_USER="$AGENT_USER"
  export OPPTRIX_AGENT_UID="$AGENT_UID"
  export OPPTRIX_AGENT_GID="$AGENT_GID"
fi

if [ "$(id -u)" = "0" ] && [ -n "$AGENT_UID" ]; then
  # Root-created files under setgid dirs need group-write for the agent user
  umask 002

  case "$WORKSPACE_DIR" in
    "$DATA_DIR"|"$DATA_DIR"/*)
      # Legacy: workspace under data — keep data traversable; lock sensitive leaves
      chmod 755 "$DATA_DIR" || true
      for leaf in \
        opptrix.db opptrix.db-wal opptrix.db-shm \
        providers sessions session-state agent-privileges \
        market-data runtimes auth.key vault.key \
        tushare-config.json watchlist.json portfolio.json \
        news-translation-cache.json browser-screenshots
      do
        if [ -e "$DATA_DIR/$leaf" ]; then
          chown -R root:root "$DATA_DIR/$leaf" 2>/dev/null || true
          chmod -R go-rwx "$DATA_DIR/$leaf" 2>/dev/null || true
        fi
      done
      ;;
    *)
      chown -R root:root "$DATA_DIR" 2>/dev/null || true
      chmod 700 "$DATA_DIR" || true
      ;;
  esac

  chown -R root:root "$SYSTEM_DIR" 2>/dev/null || true
  chmod 700 "$SYSTEM_DIR" || true

  chown -R "${AGENT_UID}:${AGENT_GID}" "$WORKSPACE_DIR" "$MOUNTS_DIR" 2>/dev/null || true
  chmod 2770 "$WORKSPACE_DIR" "$MOUNTS_DIR" || true

  # Models: readable by agent group (optional RO use); writable by root
  chown -R "root:${AGENT_GID}" "$MODELS_DIR" 2>/dev/null || true
  chmod 755 "$MODELS_DIR" || true
  find "$MODELS_DIR" -type d -exec chmod 755 {} + 2>/dev/null || true
  find "$MODELS_DIR" -type f -exec chmod 644 {} + 2>/dev/null || true

  echo "[opptrix] agent-dac user=$AGENT_USER uid=$AGENT_UID gid=$AGENT_GID workspace=$WORKSPACE_DIR mounts=$MOUNTS_DIR"
else
  echo "[opptrix] WARN: agent DAC skipped (need root + user $AGENT_USER); shell runs as service uid"
fi

# Optional runtime mirror auto (pip / npm registry env) — default on in Docker
if [ "${OPPTRIX_MIRROR_AUTO:-1}" = "1" ]; then
  if eval "$(node /app/scripts/docker-select-mirrors.mjs --runtime-eval 2>/dev/null)"; then
    if [ -n "${PIP_INDEX_URL:-}" ]; then export PIP_INDEX_URL; fi
    if [ -n "${NPM_CONFIG_REGISTRY:-}" ]; then
      npm config set registry "$NPM_CONFIG_REGISTRY" 2>/dev/null || true
    fi
    echo "[opptrix] OPPTRIX_MIRROR_AUTO profile=${OPPTRIX_MIRROR_PROFILE:-unknown}"
  fi
fi

WITH_MODELS="${OPPTRIX_WITH_MODELS:-1}"
FETCH_ON_START="${OPPTRIX_FETCH_MODELS_ON_START:-0}"
SKIP_FETCH="${OPPTRIX_SKIP_MODEL_FETCH:-0}"
FORCE_FETCH="${OPPTRIX_FORCE_MODEL_FETCH:-0}"

# Marker files — same readiness as docker-fetch-models.mjs / post-fetch env gating below.
e5_onnx="$OPPTRIX_E5_BUNDLED_DIR/onnx/model_quantized.onnx"
rapid_det="$OPPTRIX_RAPIDOCR_MODEL_DIR/ch_PP-OCRv4_det_mobile.onnx"
sv_q8="$OPPTRIX_SENSEVOICE_BUNDLED_DIR/sensevoice-small-q8.gguf"
hy_mt="$OPPTRIX_LLM_DIR/HY-MT1.5-1.8B-Q4_K_M.gguf"

models_present=0
if [ -f "$e5_onnx" ] && [ -f "$rapid_det" ] && [ -f "$sv_q8" ] && [ -f "$hy_mt" ]; then
  models_present=1
fi

if [ "$WITH_MODELS" != "1" ] || [ "$SKIP_FETCH" = "1" ] || [ "$FETCH_ON_START" != "1" ]; then
  echo "[opptrix] skipping model fetch (OPPTRIX_WITH_MODELS=$WITH_MODELS OPPTRIX_SKIP_MODEL_FETCH=$SKIP_FETCH OPPTRIX_FETCH_MODELS_ON_START=$FETCH_ON_START)"
elif [ "$models_present" = "1" ] && [ "$FORCE_FETCH" != "1" ]; then
  echo "[opptrix] core models already on volume $MODELS_DIR — skip download (set OPPTRIX_FORCE_MODEL_FETCH=1 to re-fetch)"
else
  if [ "$FORCE_FETCH" = "1" ]; then
    echo "[opptrix] OPPTRIX_FORCE_MODEL_FETCH=1 — re-checking / fetching models under $MODELS_DIR …"
  else
    echo "[opptrix] ensuring core models under $MODELS_DIR …"
  fi
  if ! node /app/scripts/docker-fetch-models.mjs; then
    echo "[opptrix] WARN: model fetch failed (network?). Server will still start; models can be filled later."
  fi
fi

# Only export bundled dirs when marker files exist (avoid empty env paths blocking user fallbacks)
if [ -f "$e5_onnx" ]; then
  export OPPTRIX_E5_BUNDLED_DIR
else
  unset OPPTRIX_E5_BUNDLED_DIR || true
fi

if [ -f "$rapid_det" ]; then
  export OPPTRIX_RAPIDOCR_MODEL_DIR
  export OPPTRIX_RAPIDOCR_BUNDLED_DIR
else
  unset OPPTRIX_RAPIDOCR_MODEL_DIR || true
  unset OPPTRIX_RAPIDOCR_BUNDLED_DIR || true
fi

if [ -f "$sv_q8" ]; then
  export OPPTRIX_SENSEVOICE_BUNDLED_DIR
else
  unset OPPTRIX_SENSEVOICE_BUNDLED_DIR || true
fi

export STOCK_RESEARCH_HOST="${STOCK_RESEARCH_HOST:-0.0.0.0}"
export STOCK_RESEARCH_PORT="${STOCK_RESEARCH_PORT:-8711}"
export SERVE_UI="${SERVE_UI:-1}"

# ── System slot: optional CDN promote, seed from /app, activate, resolve boot ──
SYSTEM_BOOT="/app/scripts/system-boot.mjs"
BOOTSTRAP_CDN="/app/scripts/bootstrap-cdn-runtime.mjs"
if [ ! -f "$SYSTEM_BOOT" ]; then
  echo "[opptrix] ERROR: missing $SYSTEM_BOOT"
  exit 1
fi

# A′: probe CDN for newer runtime (soft-fail). Bundled /app remains offline fallback.
if [ -f "$BOOTSTRAP_CDN" ]; then
  node "$BOOTSTRAP_CDN" || echo "[opptrix] WARN: bootstrap-cdn exited $?"
fi

node "$SYSTEM_BOOT" ensure
node "$SYSTEM_BOOT" activate-pending
BOOT="$(node "$SYSTEM_BOOT" print-boot)"
BOOT="$(printf '%s' "$BOOT" | tr -d '\r\n')"
if [ -z "$BOOT" ] || [ ! -d "$BOOT" ]; then
  echo "[opptrix] ERROR: invalid boot path: '$BOOT'"
  exit 1
fi

export UI_DIST_PATH="${UI_DIST_PATH:-$BOOT/client-ui/dist}"
# Prefer UI under the active slot when operator left the image default
case "$UI_DIST_PATH" in
  /app/client-ui/dist) export UI_DIST_PATH="$BOOT/client-ui/dist" ;;
esac

echo "[opptrix] data=$OPPTRIX_DATA_DIR models=$MODELS_DIR system=$OPPTRIX_SYSTEM_DIR"
echo "[opptrix] workspace=$OPPTRIX_AGENT_WORKSPACE_DIR mounts=$OPPTRIX_MOUNTS_DIR"
echo "[opptrix] boot=$BOOT ui=$UI_DIST_PATH"
echo "[opptrix] listening on ${STOCK_RESEARCH_HOST}:${STOCK_RESEARCH_PORT}"

# Default CMD when none passed
if [ "$#" -eq 0 ]; then
  set -- node apps/server/dist/index.js
fi

ONCE="${OPPTRIX_ONCE:-0}"
MAX_RETRIES="${OPPTRIX_SUPERVISOR_MAX_RETRIES:-}"
crash_streak=0
backoff_sec=1
max_backoff_sec=30

# Supervisor loop — do not exec once forever without restart.
while true; do
  # Re-resolve boot each iteration (activate may have switched the symlink)
  node "$SYSTEM_BOOT" activate-pending 2>/dev/null || true
  BOOT="$(node "$SYSTEM_BOOT" print-boot)"
  BOOT="$(printf '%s' "$BOOT" | tr -d '\r\n')"
  export UI_DIST_PATH="$BOOT/client-ui/dist"
  cd "$BOOT"

  echo "[opptrix] supervisor: starting ($*) in $BOOT"
  set +e
  "$@"
  code=$?
  set -e
  echo "[opptrix] supervisor: process exited code=$code"

  if [ "$code" -eq 42 ]; then
    echo "[opptrix] supervisor: exit 42 → activate pending, restart"
    node "$SYSTEM_BOOT" activate-pending || echo "[opptrix] WARN: activate-pending failed"
    crash_streak=0
    backoff_sec=1
    continue
  fi

  if [ "$code" -eq 43 ] || [ "$code" -eq 44 ]; then
    echo "[opptrix] supervisor: exit $code → soft restart (no activate)"
    crash_streak=0
    backoff_sec=1
    continue
  fi

  if [ "$code" -eq 0 ]; then
    if [ "$ONCE" = "1" ]; then
      echo "[opptrix] supervisor: exit 0 + OPPTRIX_ONCE=1 → stop"
      exit 0
    fi
    echo "[opptrix] supervisor: exit 0 → restart (set OPPTRIX_ONCE=1 to stop)"
    crash_streak=0
    backoff_sec=1
    continue
  fi

  crash_streak=$((crash_streak + 1))
  if [ -n "$MAX_RETRIES" ] && [ "$crash_streak" -gt "$MAX_RETRIES" ]; then
    echo "[opptrix] supervisor: exceeded OPPTRIX_SUPERVISOR_MAX_RETRIES=$MAX_RETRIES — giving up"
    exit "$code"
  fi
  echo "[opptrix] supervisor: crash #$crash_streak — sleep ${backoff_sec}s then restart"
  sleep "$backoff_sec"
  next=$((backoff_sec * 2))
  if [ "$next" -gt "$max_backoff_sec" ]; then
    backoff_sec=$max_backoff_sec
  else
    backoff_sec=$next
  fi
done
