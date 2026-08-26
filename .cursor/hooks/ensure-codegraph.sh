#!/usr/bin/env bash
# 薄包装：仓库内 hooks.json 入口 → 本地完整脚本（不入 Git）
set -euo pipefail
HOME_SCRIPT="${HOME}/.projects-rules/Opptrix/.cursor/hooks/ensure-codegraph.sh"
if [[ ! -x "$HOME_SCRIPT" ]]; then
  printf '%s\n' '{"additional_context":"⚠️ 本地 hooks 未安装。请运行: ./author/scripts/bootstrap-local-rules.sh"}'
  exit 0
fi
exec "$HOME_SCRIPT" "$@"
