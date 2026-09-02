#!/usr/bin/env bash
# Run runtime pack inside linux/arm64 Node container (QEMU on amd64 GitHub runners).
# Avoids queueing on ubuntu-24.04-arm64 hosted runners while keeping native arm64 binaries.
#
# Modes (OPPTRIX_CI_ARM64_MODE):
#   audit   — ci-selfhost-release preflight (default)
#   publish — tag release pack (npm run build + pack-opptrix-runtime)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/lib/ci-pins.env"

ROOT="${GITHUB_WORKSPACE:-$(cd "${SCRIPT_DIR}/.." && pwd)}"
VERSION="${RUNTIME_CI_VERSION:?RUNTIME_CI_VERSION required}"
MODE="${OPPTRIX_CI_ARM64_MODE:-audit}"
IMAGE="${OPPTRIX_CI_ARM64_IMAGE:-${CI_NODE_BOOKWORM_IMAGE}}"
RELEASE_TAG="${OPPTRIX_RELEASE_TAG:-opptrix-selfhost-v${VERSION}}"
MIN_BASE="${OPPTRIX_MIN_BASE_IMAGE:-${RELEASE_TAG}}"

echo "[ci:arm64-pack] mode=$MODE image=$IMAGE version=$VERSION node_patch=${OPPTRIX_NODE_PATCH_VERSION} minBase=${MIN_BASE}"

docker run --rm --platform linux/arm64 \
  -v "${ROOT}:/workspace" \
  -w /workspace \
  -e "RUNTIME_CI_VERSION=${VERSION}" \
  -e "OPPTRIX_APP_VERSION=${VERSION}" \
  -e "OPPTRIX_RELEASE_TAG=${RELEASE_TAG}" \
  -e "OPPTRIX_MIN_BASE_IMAGE=${MIN_BASE}" \
  -e "OPPTRIX_PACK_ASSERT_NO_ABI=${OPPTRIX_PACK_ASSERT_NO_ABI:-}" \
  -e "OPPTRIX_CI_ARM64_MODE=${MODE}" \
  "$IMAGE" \
  bash -lc '
    set -euo pipefail
    export DEBIAN_FRONTEND=noninteractive
    apt-get update
    apt-get install -y --no-install-recommends \
      python3 make g++ build-essential pkg-config git ca-certificates
    npm ci
    case "${OPPTRIX_CI_ARM64_MODE}" in
      publish)
        npm run build
        npm prune --omit=dev
        node scripts/materialize-vendor.mjs --app /workspace --vendor /tmp/opptrix-pack-vendor/node_modules
        ASSERT=()
        if [[ "${OPPTRIX_PACK_ASSERT_NO_ABI:-}" == "1" ]]; then
          ASSERT=(--assert-no-abi)
        fi
        node scripts/pack-opptrix-runtime.mjs \
          --version "${RUNTIME_CI_VERSION}" \
          --platform-key linux-arm64 \
          --out-dir dist-runtime \
          --also-platform-name \
          "${ASSERT[@]}"
        ;;
      audit|*)
        node scripts/audit-selfhost-release.mjs \
          --runtime \
          --version "${RUNTIME_CI_VERSION}" \
          --platform-key linux-arm64
        ;;
    esac
  '
