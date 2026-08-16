#!/usr/bin/env bash
# Raise open-file soft limit on macOS before electron-builder / codesign deep-scan.
# Soft-only (`ulimit -S -n`) so we never clamp hard from unlimited → N (EMFILE risk).
set -euo pipefail

if [[ "$(uname -s)" != "Darwin" ]]; then
  exec "$@"
fi

raise_fd_soft() {
  local target
  for target in 1048576 524288 131072 65536; do
    if ulimit -S -n "$target" 2>/dev/null; then
      echo "[with-raised-fd-limit] raised soft limit to $target"
      return 0
    fi
  done
  return 1
}

echo "[with-raised-fd-limit] before soft=$(ulimit -Sn) hard=$(ulimit -Hn)"

if ! raise_fd_soft; then
  echo "[with-raised-fd-limit] failed to raise soft ulimit -S -n (tried 1048576→65536)" >&2
  exit 1
fi

soft="$(ulimit -Sn)"
hard="$(ulimit -Hn)"
echo "[with-raised-fd-limit] after soft=$soft hard=$hard"

if [[ "$soft" != "unlimited" && "$soft" -lt 20000 ]]; then
  echo "[with-raised-fd-limit] soft limit $soft < 20000 — aborting" >&2
  exit 1
fi

exec "$@"
