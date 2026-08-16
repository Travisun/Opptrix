#!/usr/bin/env python3
"""因子收益序列择时开关。纯 stdlib。"""
from __future__ import annotations

import argparse
import json
import math
import sys
from collections import defaultdict
from typing import Any

SKILL = "factor-timing"


def compute(payload: dict[str, Any]) -> dict[str, Any]:
    params = payload.get("params") if isinstance(payload.get("params"), dict) else {}
    window = int(params.get("window") or 20)
    thr = float(params.get("threshold") or 0.0)
    panels = payload.get("panels") if isinstance(payload.get("panels"), dict) else {}
    rows = panels.get("factor_returns")
    if not isinstance(rows, list) or not rows:
        return {
            "ok": False, "skill": SKILL, "signal": [], "series": {}, "metrics": {},
            "assumptions": [], "errors": ["缺少 panels.factor_returns"], "meta": {},
        }
    by_f: dict[str, list[tuple[str, float]]] = defaultdict(list)
    for r in rows:
        if not isinstance(r, dict):
            continue
        try:
            ret = float(r["ret"])
        except (KeyError, TypeError, ValueError):
            continue
        if not math.isfinite(ret):
            continue
        fac = str(r.get("factor") or "FACTOR")
        by_f[fac].append((str(r.get("date") or ""), ret))
    signal: list[dict[str, Any]] = []
    series: dict[str, list[dict[str, Any]]] = {}
    for fac, seq in by_f.items():
        seq = sorted(seq, key=lambda x: x[0])
        on_off: list[dict[str, Any]] = []
        for i in range(len(seq)):
            if i + 1 < window:
                continue
            chunk = [seq[j][1] for j in range(i + 1 - window, i + 1)]
            m = sum(chunk) / len(chunk)
            state = 1 if m > thr else 0
            on_off.append({"date": seq[i][0], "factor": fac, "value": state, "roll_mean": round(m, 8)})
        series[fac] = on_off
        if on_off:
            signal.append(on_off[-1])
    if not signal:
        return {
            "ok": False, "skill": SKILL, "signal": [], "series": series, "metrics": {"window": window},
            "assumptions": [], "errors": ["因子收益序列过短"], "meta": {},
        }
    return {
        "ok": True, "skill": SKILL, "signal": signal, "series": series,
        "metrics": {"window": window, "threshold": thr, "factors": len(by_f)},
        "assumptions": ["对上游因子收益做滚动均值开关；非参数寻优。"],
        "errors": [], "meta": {"degraded": False},
    }

def main() -> int:
    ap = argparse.ArgumentParser(description=SKILL)
    ap.add_argument("--input", required=True)
    ap.add_argument("--output")
    args = ap.parse_args()
    try:
        with open(args.input, encoding="utf-8") as f:
            payload = json.load(f)
        if not isinstance(payload, dict):
            raise ValueError("input 须为 JSON 对象")
        result = compute(payload)
    except Exception as e:
        result = {
            "ok": False, "skill": SKILL, "signal": [], "series": {},
            "metrics": {}, "assumptions": [], "errors": [str(e)], "meta": {},
        }
        print(json.dumps(result, ensure_ascii=False), file=sys.stderr)
        if args.output:
            with open(args.output, "w", encoding="utf-8") as f:
                json.dump(result, f, ensure_ascii=False, indent=2)
                f.write("\n")
        return 1
    text = json.dumps(result, ensure_ascii=False, indent=2)
    if args.output:
        with open(args.output, "w", encoding="utf-8") as f:
            f.write(text)
            f.write("\n")
    print(text)
    return 0 if result.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main())
