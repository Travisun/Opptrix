#!/usr/bin/env bash
# 校验 Opptrix 本地规则/配置是否已安装到 ~/.projects-rules/Opptrix/
# 首次克隆或换机后：从私有备份复制到 DEST，再运行本脚本校验。
set -euo pipefail

DEST="${HOME}/.projects-rules/Opptrix"
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

required=(
  "$DEST/.cursor/rules/task-architecture-gate.mdc"
  "$DEST/.cursor/hooks/ensure-codegraph.sh"
  "$DEST/.mimocode/skills/codegraph/SKILL.md"
  "$DEST/.mimocode/mimocode.jsonc"
)

missing=0
for f in "${required[@]}"; do
  if [[ ! -f "$f" ]]; then
    echo "缺少: $f"
    missing=1
  fi
done

if [[ "$missing" -ne 0 ]]; then
  echo ""
  echo "请将完整规则目录复制到: $DEST"
  echo "（含 .cursor/rules、.cursor/hooks、.cursor/skills、.mimocode/、.codegraph/）"
  exit 1
fi

mkdir -p "$REPO_ROOT/.cursor/hooks"
chmod +x "$DEST/.cursor/hooks/ensure-codegraph.sh" 2>/dev/null || true
chmod +x "$REPO_ROOT/.cursor/hooks/ensure-codegraph.sh" 2>/dev/null || true

# 可选：本机 MCP 配置（已 gitignore，勿提交）
if [[ -f "$DEST/.cursor/mcp.json" && ! -f "$REPO_ROOT/.cursor/mcp.json" ]]; then
  cp "$DEST/.cursor/mcp.json" "$REPO_ROOT/.cursor/mcp.json"
  echo "已复制 mcp.json 到 $REPO_ROOT/.cursor/（本地专用，不入 Git）"
fi

echo "本地规则目录: $DEST"
echo "Cursor: L0 读仓库 rules-index；L1/L2 Read 本地 .mdc"
echo "MiMoCode: Read $DEST/.mimocode/skills/*/SKILL.md"
