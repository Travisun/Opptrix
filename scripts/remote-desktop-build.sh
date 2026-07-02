#!/usr/bin/env bash
# Build desktop on a remote Mac (e.g. Mac Studio) over SSH.
# Remote machine pulls code via git (SSH key on Mac Studio → GitHub).
#
# Usage:
#   ./scripts/remote-desktop-build.sh macstudio
#   ./scripts/remote-desktop-build.sh macstudio --full
#   OPPTRIX_GIT_BRANCH=feature/foo ./scripts/remote-desktop-build.sh macstudio
#
# Logs:
#   Local:  logs/remote-desktop-build-<timestamp>.log
#   Remote: ~/Documents/Opptrix/logs/remote-build-<timestamp>.log
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

HOST="${1:?Usage: $0 <ssh-host> [--dir|--full]}"
MODE="${2:-}"

REMOTE_DIR="${OPPTRIX_REMOTE_DIR:-~/Documents/Opptrix}"
GIT_URL="${OPPTRIX_GIT_URL:-$(git remote get-url origin 2>/dev/null || echo 'git@github.com:Travisun/Opptrix.git')}"
GIT_BRANCH="${OPPTRIX_GIT_BRANCH:-$(git branch --show-current 2>/dev/null || echo main)}"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
LOCAL_LOG_DIR="${OPPTRIX_LOCAL_LOG_DIR:-$ROOT/logs}"
LOCAL_LOG="${OPPTRIX_REMOTE_LOG:-$LOCAL_LOG_DIR/remote-desktop-build-${TIMESTAMP}.log}"
REMOTE_LOG="logs/remote-build-${TIMESTAMP}.log"

BUILD_CMD="npm run build:local -w @opptrix/desktop"
case "$MODE" in
  ""|--dir) BUILD_CMD="npm run build:local -w @opptrix/desktop" ;;
  --full)   BUILD_CMD="npm run build -w @opptrix/desktop" ;;
  *) echo "Unknown mode: $MODE (use --dir or --full)" >&2; exit 2 ;;
esac

mkdir -p "$LOCAL_LOG_DIR"

log() {
  printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" | tee -a "$LOCAL_LOG"
}

log "host=$HOST remote_dir=$REMOTE_DIR branch=$GIT_BRANCH mode=${MODE:-default}"
log "git_url=$GIT_URL"
log "local_log=$LOCAL_LOG"
log "remote_log=$REMOTE_DIR/$REMOTE_LOG"

log "→ Git pull on ${HOST}:${REMOTE_DIR}"
ssh "$HOST" "set -euo pipefail
  REPO_DIR=${REMOTE_DIR}
  mkdir -p \"\$(dirname \"\$REPO_DIR\")\"
  if [[ ! -d \"\$REPO_DIR/.git\" ]]; then
    echo 'Cloning' ${GIT_URL} '→' \"\$REPO_DIR\"
    git clone --branch ${GIT_BRANCH} ${GIT_URL} \"\$REPO_DIR\"
  else
    cd \"\$REPO_DIR\"
    git fetch origin
    git checkout ${GIT_BRANCH}
    git pull --ff-only origin ${GIT_BRANCH}
  fi
" 2>&1 | tee -a "$LOCAL_LOG"

log "→ Building on ${HOST} (remote log: ${REMOTE_DIR}/${REMOTE_LOG})"
ssh "$HOST" "set -euo pipefail
  cd ${REMOTE_DIR}
  mkdir -p logs
  exec > >(tee -a ${REMOTE_LOG}) 2>&1
  echo '=== remote build started:' \$(date -Iseconds)
  echo 'host:' \$(hostname) 'arch:' \$(uname -m) 'macOS:' \$(sw_vers -productVersion)
  echo 'node:' \$(node -v 2>/dev/null || echo missing)
  echo 'git:' \$(git rev-parse --short HEAD) \$(git branch --show-current)
  echo 'cmd: npm ci && ${BUILD_CMD}'
  npm ci
  ${BUILD_CMD}
  echo '=== remote build finished:' \$(date -Iseconds)
" 2>&1 | tee -a "$LOCAL_LOG"

log "→ Done"
log "Fetch release artifacts:"
log "  rsync -az --progress ${HOST}:${REMOTE_DIR}/apps/desktop/release/ ./apps/desktop/release/"
log "Fetch remote build log:"
log "  rsync -az --progress ${HOST}:${REMOTE_DIR}/${REMOTE_LOG} ./logs/"
