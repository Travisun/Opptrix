#!/usr/bin/env python3
"""行业/ETF 量价轮动。纯 stdlib；禁止 qlib。"""
from __future__ import annotations

import argparse
import json
import math
import sys
from collections import defaultdict
from typing import Any

SKILL = "industry-vp-rotation"


def compute(payload: dict[str, Any]) -> dict[str, Any]:
    params = payload.get("params") if isinstance(payload.get("params"), dict) else {}
    window = int(params.get("window") or 20)
    bars = payload.get("bars")
    if not isinstance(bars, list) or not bars:
        raise ValueError("input.bars 须为行业/ETF 日K")
    by: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for b in bars:
        if not isinstance(b, dict):
            continue
        try:
            c = float(b["close"]); v = float(b.get("volume") or 0)
        except (KeyError, TypeError, ValueError):
            continue
        if not math.isfinite(c) or c <= 0:
            continue
        by[str(b.get("symbol") or "")].append({"date": str(b.get("date") or ""), "close": c, "volume": max(v, 0.0)})
    scores: list[dict[str, Any]] = []
    for sym, rows in by.items():
        if not sym:
            continue
        rows = sorted(rows, key=lambda r: r["date"])
        if len(rows) < window + 1:
            continue
        chunk = rows[-(window + 1):]
        mom = chunk[-1]["close"] / chunk[0]["close"] - 1.0
        vols = [r["volume"] for r in chunk[1:]]
        avg_v = sum(vols) / len(vols) if vols else 0.0
        rel_v = (vols[-1] / avg_v) if avg_v > 0 else 1.0
        score = mom * math.log1p(rel_v)
        if not math.isfinite(score):
            continue
        scores.append({"symbol": sym, "date": chunk[-1]["date"], "value": round(score, 8),
                       "momentum": round(mom, 8), "rel_volume": round(rel_v, 6)})
    if not scores:
        raise ValueError("有效行业/ETF 不足")
    scores.sort(key=lambda x: (-x["value"], x["symbol"]))
    for i, s in enumerate(scores, 1):
        s["rank"] = i
    return {
        "ok": True, "skill": SKILL, "signal": scores, "series": {"rotation": scores},
        "metrics": {"window": window, "symbols": len(scores)},
        "assumptions": ["纯日频量价强度，无 qlib 表达式；轮动排序非仓位建议。"],
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
