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

if [ "$WITH_MODELS" = "1" ] && [ "$SKIP_FETCH" != "1" ]; then
  echo "[opptrix] ensuring core models under $MODELS_DIR …"
  if ! node /app/scripts/docker-fetch-models.mjs; then
    echo "[opptrix] WARN: model fetch failed (network?). Server will still start; models can be filled later."
  fi
else
  echo "[opptrix] skipping model fetch (OPPTRIX_WITH_MODELS=$WITH_MODELS OPPTRIX_SKIP_MODEL_FETCH=$SKIP_FETCH)"
fi

# Only export bundled dirs when marker files exist (avoid empty env paths blocking user fallbacks)
e5_onnx="$OPPTRIX_E5_BUNDLED_DIR/onnx/model_quantized.onnx"
if [ -f "$e5_onnx" ]; then
  export OPPTRIX_E5_BUNDLED_DIR
else
  unset OPPTRIX_E5_BUNDLED_DIR || true
fi

rapid_det="$OPPTRIX_RAPIDOCR_MODEL_DIR/ch_PP-OCRv4_det_mobile.onnx"
if [ -f "$rapid_det" ]; then
  export OPPTRIX_RAPIDOCR_MODEL_DIR
  export OPPTRIX_RAPIDOCR_BUNDLED_DIR
else
  unset OPPTRIX_RAPIDOCR_MODEL_DIR || true
  unset OPPTRIX_RAPIDOCR_BUNDLED_DIR || true
fi

sv_q8="$OPPTRIX_SENSEVOICE_BUNDLED_DIR/sensevoice-small-q8.gguf"
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
