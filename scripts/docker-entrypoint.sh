#!/bin/sh
# Opptrix Docker entrypoint — volumes, optional model fetch, system slot boot + supervisor.
#
# Models: image is model-free. By default we do NOT run docker-fetch-models.mjs on start
# (set OPPTRIX_FETCH_MODELS_ON_START=1 to restore legacy first-boot download). Product
# onboarding downloads models into /models. OPPTRIX_SKIP_MODEL_FETCH=1 always skips.
#
# Mirrors: OPPTRIX_MIRROR_AUTO=1 probes registries and exports PIP_INDEX_URL / npm registry.
#
# Layout ($OPPTRIX_SYSTEM_DIR, default /system):
#   boot -> slots/<ver>, backup -> slots/<prev>, update/, slots/, state.json
# Image /app is the seed tree; runtime code runs from /system/boot.
#
# Supervisor exit codes (server process):
#   42 — activate pending (if any), then restart
#   43 / 44 — soft restart without activate
#   other non-zero — log, backoff sleep, restart
#   0 — restart unless OPPTRIX_ONCE=1
set -eu

DATA_DIR="${OPPTRIX_DATA_DIR:-/data}"
MODELS_DIR="${OPPTRIX_MODELS_DIR:-/models}"
SYSTEM_DIR="${OPPTRIX_SYSTEM_DIR:-/system}"
SEED_ROOT="${OPPTRIX_SEED_ROOT:-/app}"

mkdir -p "$DATA_DIR" "$DATA_DIR/mounts" "$MODELS_DIR" \
  "$MODELS_DIR/llms" \
  "$MODELS_DIR/llms/multilingual-e5-small" \
  "$MODELS_DIR/llms/rapidocr-ppocrv4-mobile" \
  "$MODELS_DIR/sensevoice" \
  "$SYSTEM_DIR"

# Default model layout (with-models):
#   /models/llms/multilingual-e5-small/     → OPPTRIX_E5_BUNDLED_DIR
#   /models/llms/rapidocr-ppocrv4-mobile/   → OPPTRIX_RAPIDOCR_MODEL_DIR / BUNDLED
#   /models/llms/*.gguf                    → HY-MT offline translation (OPPTRIX_LLM_DIR)
#   /models/sensevoice/                    → OPPTRIX_SENSEVOICE_BUNDLED_DIR (q8 + VAD)
#   /models/llms                           → OPPTRIX_LLM_DIR
export OPPTRIX_DATA_DIR="$DATA_DIR"
export OPPTRIX_SYSTEM_DIR="$SYSTEM_DIR"
export OPPTRIX_SEED_ROOT="$SEED_ROOT"
export OPPTRIX_DOCKER="${OPPTRIX_DOCKER:-1}"
export OPPTRIX_LLM_DIR="${OPPTRIX_LLM_DIR:-$MODELS_DIR/llms}"
export OPPTRIX_E5_BUNDLED_DIR="${OPPTRIX_E5_BUNDLED_DIR:-$MODELS_DIR/llms/multilingual-e5-small}"
export OPPTRIX_RAPIDOCR_MODEL_DIR="${OPPTRIX_RAPIDOCR_MODEL_DIR:-$MODELS_DIR/llms/rapidocr-ppocrv4-mobile}"
export OPPTRIX_RAPIDOCR_BUNDLED_DIR="${OPPTRIX_RAPIDOCR_BUNDLED_DIR:-$MODELS_DIR/llms/rapidocr-ppocrv4-mobile}"
export OPPTRIX_SENSEVOICE_BUNDLED_DIR="${OPPTRIX_SENSEVOICE_BUNDLED_DIR:-$MODELS_DIR/sensevoice}"

# Optional runtime mirror auto (pip / npm registry env)
if [ "${OPPTRIX_MIRROR_AUTO:-0}" = "1" ]; then
  if eval "$(node /app/scripts/docker-select-mirrors.mjs --runtime-eval 2>/dev/null)"; then
    if [ -n "${PIP_INDEX_URL:-}" ]; then export PIP_INDEX_URL; fi
    if [ -n "${NPM_CONFIG_REGISTRY:-}" ]; then
      npm config set registry "$NPM_CONFIG_REGISTRY" 2>/dev/null || true
    fi
    echo "[opptrix] OPPTRIX_MIRROR_AUTO profile=${OPPTRIX_MIRROR_PROFILE:-unknown}"
  fi
fi

# Extra host mounts convention (bind from compose): /data/mounts/<name>
# Sibling API resolves these under OPPTRIX_DATA_DIR/mounts.

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

# ── System slot: seed from /app if needed, activate pending, resolve boot ──
SYSTEM_BOOT="/app/scripts/system-boot.mjs"
if [ ! -f "$SYSTEM_BOOT" ]; then
  echo "[opptrix] ERROR: missing $SYSTEM_BOOT"
  exit 1
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
