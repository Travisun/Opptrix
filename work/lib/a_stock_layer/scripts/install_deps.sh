#!/bin/bash
# A股数据层 — 一键安装依赖
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_DIR="$(dirname "$SCRIPT_DIR")"

echo "=== 安装核心依赖 ==="
pip install -r "$PLUGIN_DIR/requirements.txt"

echo ""
echo "=== 可选: 安装完整依赖（含 mootdx + efinance + pandas）==="
echo "  执行: pip install -e \"$PLUGIN_DIR[full]\""
echo ""
echo "=== 可选: 仅安装库 ==="
echo "  执行: pip install -e \"$PLUGIN_DIR\""
echo ""
echo "=== 安装完成 ==="
