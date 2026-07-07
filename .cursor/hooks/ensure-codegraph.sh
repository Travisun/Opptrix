#!/usr/bin/env bash
# 每次 Agent 会话启动时：确保 CodeGraph 索引存在且已同步，并提示使用本地 MCP。
set -euo pipefail

CG="${CODEGRAPH_BIN:-/Users/mac/.local/bin/codegraph}"
ROOT="${CURSOR_PROJECT_DIR:-$(pwd)}"

# 消费 sessionStart stdin（若有）
if [ ! -t 0 ]; then
  cat >/dev/null 2>&1 || true
fi

if [[ ! -x "$CG" ]]; then
  printf '%s\n' '{"additional_context":"⚠️ CodeGraph CLI 未找到。请安装: curl -fsSL https://raw.githubusercontent.com/colbymchenry/codegraph/main/install.sh | sh"}'
  exit 0
fi

if [[ ! -f "$ROOT/.codegraph/codegraph.db" ]]; then
  "$CG" init "$ROOT" >/dev/null 2>&1 || true
else
  "$CG" sync "$ROOT" >/dev/null 2>&1 || true
fi

printf '%s\n' '{"env":{"CODEGRAPH_TELEMETRY":"0"},"additional_context":"[CodeGraph] 本地索引已就绪。探索代码前必须使用 MCP 工具 codegraph_explore（100% 本地，勿全库 Grep/Read）。索引随文件变更自动同步。"}'
