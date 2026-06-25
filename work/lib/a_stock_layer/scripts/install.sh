#!/usr/bin/env bash
# ============================================================
# a_stock_layer — A股数据层 一键安装脚本
# ============================================================
# 用法:
#   ./scripts/install.sh                    # 安装全部依赖
#   ./scripts/install.sh --editable         # 安装后可直接修改源码
#   ./scripts/install.sh --skip-pip         # 仅检查环境，不装pip包
# ============================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_DIR="$(cd "$(dirname "$0")" PLUGIN_DIR="$(dirname "$SCRIPT_DIR")"PLUGIN_DIR="$(dirname "$SCRIPT_DIR")" pwd)"
PYTHON="${PYTHON:-python3}"

echo "=========================================="
echo "  a_stock_layer — A股数据层 安装"
echo "=========================================="
echo ""

# ── 检查 Python 版本 ──────────────────────────────────────
PY_VER=$("$PYTHON" -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')")
echo "Python 版本: $PY_VER"
if [[ "$(echo "$PY_VER" | cut -d. -f1)" -lt 3 ]] || { [[ "$(echo "$PY_VER" | cut -d. -f1)" -eq 3 ]] && [[ "$(echo "$PY_VER" | cut -d. -f2)" -lt 9 ]]; }; then
    echo "❌ 需要 Python ≥ 3.9"
    exit 1
fi
echo "✅ Python 版本满足要求"
echo ""

# ── 安装依赖 ──────────────────────────────────────────────
if [[ "${1:-}" != "--skip-pip" ]]; then
    echo "📦 安装 Python 依赖（requests + mootdx + efinance + pandas）..."

    if [[ "${1:-}" == "--editable" ]]; then
        pip install -e "$PLUGIN_DIR"
    else
        pip install -e "$PLUGIN_DIR"
    fi

    echo "✅ 依赖安装完成"
else
    echo "⏭️  跳过 pip 安装"
fi
echo ""

# ── 验证安装 ──────────────────────────────────────────────
echo "🔍 验证安装..."
VALIDATION=$("$PYTHON" -c "
try:
    from a_stock_layer import AshareEngine
    e = AshareEngine()
    count = len(e.list_drivers())
    caps = len(e.registry.get('eastmoney').capabilities())
    print(f'OK: {count} drivers, {caps} capabilities')
except Exception as ex:
    print(f'FAIL: {ex}')
" 2>&1)

if echo "$VALIDATION" | grep -q "OK:"; then
    echo "✅ 安装验证通过: $VALIDATION"
else
    echo "⚠️  安装验证异常: $VALIDATION"
fi
echo ""

# ── 快速使用示例 ─────────────────────────────────────────
echo "=========================================="
echo "  安装完成！快速开始:"
echo "=========================================="
echo ""
echo "  from a_stock_layer import AshareEngine"
echo "  engine = AshareEngine()"
echo "  r = engine.realtime('600519')"
echo "  r = engine.profile('600519')"
echo "  r = engine.tech_indicator('600519')"
echo "  r = engine.global_index()"
echo ""
echo "  # 查看所有 API:"
echo "  api_list = [m for m in dir(engine) if not m.startswith('_')]"
echo "=========================================="
