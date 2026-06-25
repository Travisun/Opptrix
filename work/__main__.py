"""
stock-research TUI 入口 — 固定面板，零滚动

用法:
  cd work && python __main__.py
  python -m work
"""

import os
import sys

_work_dir = os.path.dirname(os.path.abspath(__file__))
_lib_init = os.path.join(_work_dir, "lib", "__init__.py")

if os.path.exists(_lib_init):
    import importlib.util
    spec = importlib.util.spec_from_file_location("lib_bootstrap", _lib_init)
    if spec and spec.loader:
        try:
            mod = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(mod)
        except Exception:
            pass

if _work_dir not in sys.path:
    sys.path.insert(0, _work_dir)

try:
    from stock_research.tui import ResearchTUI
    app = ResearchTUI()
    app.run()
except KeyboardInterrupt:
    print("\n👋 再见")
except ImportError as e:
    print(f"\n❌ 需要安装 textual: pip install textual")
    print(f"   {e}")
    sys.exit(1)
except Exception as e:
    print(f"\n❌ 启动失败: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)
