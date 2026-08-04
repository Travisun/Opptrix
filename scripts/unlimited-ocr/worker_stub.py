#!/usr/bin/env python3
"""
Unlimited-OCR stub — returns a clear failure until a real worker + models are installed.
Protocol matches pdfplumber worker (stdin/stdout JSON lines).
"""
from __future__ import annotations

import json
import sys


def main() -> None:
    raw = sys.stdin.readline()
    try:
        req = json.loads(raw or "{}")
    except json.JSONDecodeError:
        print(json.dumps({"ok": False, "error": "无效 JSON"}, ensure_ascii=False))
        raise SystemExit(1)

    if req.get("op") == "ping":
        print(json.dumps({"ok": False, "error": "深度整理引擎未配置模型"}, ensure_ascii=False))
        raise SystemExit(2)

    print(
        json.dumps(
            {"ok": False, "error": "深度整理引擎尚未安装或未配置模型"},
            ensure_ascii=False,
        )
    )
    raise SystemExit(2)


if __name__ == "__main__":
    main()
