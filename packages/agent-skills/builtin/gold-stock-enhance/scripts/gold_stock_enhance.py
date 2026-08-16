#!/usr/bin/env python3
"""金股名单 + 日K增强排序。纯 stdlib。"""
from __future__ import annotations

import argparse
import json
import math
import sys
from collections import defaultdict
from typing import Any

SKILL = "gold-stock-enhance"


def compute(payload: dict[str, Any]) -> dict[str, Any]:
    params = payload.get("params") if isinstance(payload.get("params"), dict) else {}
    window = int(params.get("window") or 20)
    panels = payload.get("panels") if isinstance(payload.get("panels"), dict) else {}
    glist = panels.get("gold_list")
    if not isinstance(glist, list) or not glist:
        return {
            "ok": False, "skill": SKILL, "signal": [], "series": {}, "metrics": {},
            "assumptions": [], "errors": ["缺少 panels.gold_list"], "meta": {},
        }
    gold: set[str] = set()
    for r in glist:
        if isinstance(r, dict):
            s = str(r.get("symbol") or "").strip()
            if s:
                gold.add(s)
        elif isinstance(r, str) and r.strip():
            gold.add(r.strip())
    bars = payload.get("bars") if isinstance(payload.get("bars"), list) else []
    by: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for b in bars:
        if not isinstance(b, dict):
            continue
        sym = str(b.get("symbol") or "")
        if sym not in gold:
            continue
        try:
            c = float(b["close"])
        except (KeyError, TypeError, ValueError):
            continue
        if c > 0 and math.isfinite(c):
            by[sym].append({"date": str(b.get("date") or ""), "close": c})
    scores: list[dict[str, Any]] = []
    for sym in gold:
        rows = sorted(by.get(sym, []), key=lambda r: r["date"])
        if len(rows) < max(5, window // 2):
            scores.append({"symbol": sym, "value": None, "note": "缺行情"})
            continue
        chunk = rows[-window:]
        rets = []
        for i in range(1, len(chunk)):
            rets.append(chunk[i]["close"] / chunk[i - 1]["close"] - 1.0)
        mom = chunk[-1]["close"] / chunk[0]["close"] - 1.0
        vol = 0.0
        if len(rets) >= 2:
            m = sum(rets) / len(rets)
            vol = math.sqrt(sum((x - m) ** 2 for x in rets) / len(rets))
        # enhance: momentum / (vol+eps)
        score = mom / (vol + 1e-6)
        scores.append({"symbol": sym, "date": chunk[-1]["date"], "value": round(score, 8),
                       "momentum": round(mom, 8), "vol": round(vol, 8)})
    valid = [s for s in scores if s.get("value") is not None]
    valid.sort(key=lambda x: (-(x["value"] or 0), x["symbol"]))
    for i, s in enumerate(valid, 1):
        s["rank"] = i
    if not valid:
        return {
            "ok": False, "skill": SKILL, "signal": scores, "series": {}, "metrics": {},
            "assumptions": [], "errors": ["金股名单无匹配日K"], "meta": {},
        }
    return {
        "ok": True, "skill": SKILL, "signal": valid,
        "series": {"gold": scores},
        "metrics": {"gold_count": len(gold), "scored": len(valid), "window": window},
        "assumptions": ["金股名单由用户/Agent 写入；增强=动量/波动示意分。"],
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
