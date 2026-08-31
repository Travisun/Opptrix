#!/usr/bin/env sh
# Thin wrapper → opptrix (Node, cross-platform). Prefer: opptrix …
#
#   OPPTRIX_BUILD_MIRROR=cn ./scripts/docker-compose-with-mirrors.sh up -d --build
#
set -eu
ROOT="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
MIRROR="${OPPTRIX_BUILD_MIRROR:-foreign}"
exec node "$ROOT/packages/selfhost/bin/opptrix.mjs" --mirror "$MIRROR" compose -- "$@"
