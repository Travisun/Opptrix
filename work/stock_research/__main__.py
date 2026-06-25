"""
stock-research 命令行入口

用法:
  python -m stock_research
  python -m stock_research --help
"""

import sys
import os

# 把 work/ 加到 path（确保能找到 stock_eval）
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))


def main():
    # 检查 rich
    try:
        import rich  # noqa
    except ImportError:
        print("❌ 需要 rich 库: pip install rich")
        sys.exit(1)

    # 检查 yaml
    try:
        import yaml  # noqa
    except ImportError:
        print("❌ 需要 pyyaml 库: pip install pyyaml")
        sys.exit(1)

    # 检查 a_stock_layer
    try:
        import a_stock_layer  # noqa
    except ImportError:
        print("⚠️  a_stock_layer 未安装，数据功能不可用")
        print("   请先安装: pip install -e /path/to/a-stock-layer")

    try:
        from stock_research.cli.app import ResearchApp
        app = ResearchApp()
        app.run()
    except KeyboardInterrupt:
        print("\n👋 再见")
    except Exception as e:
        print(f"\n❌ 启动失败: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
