#!/usr/bin/env bash
# Run runtime pack audit inside linux/arm64 Node container (QEMU on amd64 GitHub runners).
# Avoids queueing on ubuntu-24.04-arm64 hosted runners while keeping native arm64 binaries.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/lib/ci-node-image.env"

ROOT="${GITHUB_WORKSPACE:-$(cd "${SCRIPT_DIR}/.." && pwd)}"
VERSION="${RUNTIME_CI_VERSION:?RUNTIME_CI_VERSION required}"
IMAGE="${OPPTRIX_CI_ARM64_IMAGE:-${CI_NODE_BOOKWORM_IMAGE}}"

echo "[ci:arm64-pack] image=$IMAGE version=$VERSION node_patch=${OPPTRIX_NODE_PATCH_VERSION}"

docker run --rm --platform linux/arm64 \
  -v "${ROOT}:/workspace" \
  -w /workspace \
  -e "RUNTIME_CI_VERSION=${VERSION}" \
  -e "OPPTRIX_APP_VERSION=${VERSION}" \
  -e "OPPTRIX_RELEASE_TAG=opptrix-selfhost-v${VERSION}" \
  -e "OPPTRIX_MIN_BASE_IMAGE=opptrix-selfhost-v${VERSION}" \
  "$IMAGE" \
  bash -lc '
    set -euo pipefail
    export DEBIAN_FRONTEND=noninteractive
    apt-get update
    apt-get install -y --no-install-recommends \
      python3 make g++ build-essential pkg-config git ca-certificates
    npm ci
    node scripts/audit-selfhost-release.mjs \
      --runtime \
      --version "${RUNTIME_CI_VERSION}" \
      --platform-key linux-arm64
  '
