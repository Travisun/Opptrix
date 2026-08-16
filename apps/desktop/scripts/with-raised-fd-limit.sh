#!/usr/bin/env bash
# Raise open-file limit on macOS before electron-builder / codesign deep-scan.
set -euo pipefail

if [[ "$(uname -s)" != "Darwin" ]]; then
  exec "$@"
fi

raise_fd_limit() {
  local target="${1:-65536}"
  if ulimit -n "$target" 2>/dev/null; then
    return 0
  fi
  local hard
  hard="$(ulimit -Hn 2>/dev/null || true)"
  if [[ -n "$hard" && "$hard" != "unlimited" ]]; then
    ulimit -n "$hard"
    return 0
  fi
  return 1
}

if ! raise_fd_limit 65536; then
  echo "[with-raised-fd-limit] failed to raise ulimit -n to 65536" >&2
  exit 1
fi

soft="$(ulimit -Sn)"
hard="$(ulimit -Hn)"
echo "[with-raised-fd-limit] ulimit -n soft=$soft hard=$hard"

if [[ "$soft" != "unlimited" && "$soft" -lt 20000 ]]; then
  echo "[with-raised-fd-limit] soft limit $soft < 20000 — aborting" >&2
  exit 1
fi

exec "$@"
