#!/bin/sh
# Opptrix Docker entrypoint — prepare volumes, optional first-boot model fetch, then exec server.
set -eu

DATA_DIR="${OPPTRIX_DATA_DIR:-/data}"
MODELS_DIR="${OPPTRIX_MODELS_DIR:-/models}"

mkdir -p "$DATA_DIR" "$DATA_DIR/mounts" "$MODELS_DIR" \
  "$MODELS_DIR/llms" \
  "$MODELS_DIR/llms/multilingual-e5-small" \
  "$MODELS_DIR/llms/rapidocr-ppocrv4-mobile" \
  "$MODELS_DIR/sensevoice"

# Default model layout (with-models):
#   /models/llms/multilingual-e5-small/     → OPPTRIX_E5_BUNDLED_DIR
#   /models/llms/rapidocr-ppocrv4-mobile/   → OPPTRIX_RAPIDOCR_MODEL_DIR / BUNDLED
#   /models/llms/*.gguf                    → HY-MT offline translation (OPPTRIX_LLM_DIR)
#   /models/sensevoice/                    → OPPTRIX_SENSEVOICE_BUNDLED_DIR (q8 + VAD)
#   /models/llms                           → OPPTRIX_LLM_DIR
export OPPTRIX_DATA_DIR="$DATA_DIR"
export OPPTRIX_LLM_DIR="${OPPTRIX_LLM_DIR:-$MODELS_DIR/llms}"
export OPPTRIX_E5_BUNDLED_DIR="${OPPTRIX_E5_BUNDLED_DIR:-$MODELS_DIR/llms/multilingual-e5-small}"
export OPPTRIX_RAPIDOCR_MODEL_DIR="${OPPTRIX_RAPIDOCR_MODEL_DIR:-$MODELS_DIR/llms/rapidocr-ppocrv4-mobile}"
export OPPTRIX_RAPIDOCR_BUNDLED_DIR="${OPPTRIX_RAPIDOCR_BUNDLED_DIR:-$MODELS_DIR/llms/rapidocr-ppocrv4-mobile}"
export OPPTRIX_SENSEVOICE_BUNDLED_DIR="${OPPTRIX_SENSEVOICE_BUNDLED_DIR:-$MODELS_DIR/sensevoice}"

# Extra host mounts convention (bind from compose): /data/mounts/<name>
# Sibling API resolves these under OPPTRIX_DATA_DIR/mounts.

WITH_MODELS="${OPPTRIX_WITH_MODELS:-1}"
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

if [ "$WITH_MODELS" != "1" ] || [ "$SKIP_FETCH" = "1" ]; then
  echo "[opptrix] skipping model fetch (OPPTRIX_WITH_MODELS=$WITH_MODELS OPPTRIX_SKIP_MODEL_FETCH=$SKIP_FETCH)"
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
export UI_DIST_PATH="${UI_DIST_PATH:-/app/client-ui/dist}"

echo "[opptrix] data=$OPPTRIX_DATA_DIR models=$MODELS_DIR ui=$UI_DIST_PATH"
echo "[opptrix] listening on ${STOCK_RESEARCH_HOST}:${STOCK_RESEARCH_PORT}"

cd /app
exec "$@"
