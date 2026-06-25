"""
lib — 自带依赖包

此目录包含项目自带的全部第三方代码，确保项目移至任何位置都能运行。

使用方式:
    from lib import setup_paths
    setup_paths()

    或:
    import lib  # 自动执行路径设置
"""

import os
import sys


_LIB_DIR = os.path.dirname(os.path.abspath(__file__))


def setup_paths():
    """将 lib 下的所有包目录加入 sys.path"""
    paths = [
        _LIB_DIR,                                    # lib 本身
        os.path.join(_LIB_DIR, "a_stock_layer"),     # a_stock_layer 主包
        os.path.join(_LIB_DIR, "t_strategy"),        # t-strategy
        os.path.join(_LIB_DIR, "aaashare"),          # 旧版数据层
        os.path.join(_LIB_DIR, "skills"),            # skill 脚本
        os.path.join(_LIB_DIR, "skills",
                     "closing-report"),              # 收盘报告
        os.path.join(_LIB_DIR, "skills",
                     "morning-brief"),               # 开盘早报
        os.path.join(_LIB_DIR, "skills",
                     "industry-mining"),             # 产业挖掘
        os.path.join(_LIB_DIR, "skills",
                     "portfolio-manager"),           # 持仓管理
    ]

    for p in paths:
        if os.path.isdir(p) and p not in sys.path:
            sys.path.insert(0, p)

    # 同时也把 project root 和 work/ 加进去
    root = os.path.dirname(os.path.dirname(_LIB_DIR))
    work_dir = os.path.dirname(root)
    for d in [root, work_dir]:
        if d not in sys.path:
            sys.path.insert(0, d)


# 导入时自动执行
setup_paths()


def list_packages() -> dict:
    """列出所有捆绑的包及其路径"""
    result = {}
    for name in ["a_stock_layer", "t_strategy", "aaashare",
                 "stock_eval", "stock_research"]:
        try:
            mod = __import__(name)
            result[name] = getattr(mod, "__file__", "unknown")
        except ImportError:
            result[name] = "NOT FOUND"
    return result


def summary() -> str:
    """打印依赖摘要"""
    lines = ["📦 lib 依赖包:", f"  目录: {_LIB_DIR}"]
    for pkg, path in list_packages().items():
        status = "✅" if "NOT FOUND" not in path else "❌"
        lines.append(f"  {status} {pkg}")
        if "NOT FOUND" not in path:
            lines.append(f"      {path}")
    return "\n".join(lines)
