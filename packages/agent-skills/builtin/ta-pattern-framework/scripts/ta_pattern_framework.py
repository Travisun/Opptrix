#!/usr/bin/env python3
"""核心 K 线形态规则（非完整 TA-Lib）。纯 stdlib。"""
from __future__ import annotations

import argparse
import json
import math
import sys
from collections import defaultdict
from typing import Any

SKILL = "ta-pattern-framework"


def _pat(o: float, h: float, l: float, c: float) -> list[str]:
    rng = h - l
    if rng <= 1e-12:
        return []
    body = abs(c - o)
    upper = h - max(o, c)
    lower = min(o, c) - l
    names: list[str] = []
    if body / rng < 0.1:
        names.append("doji")
    if lower >= 2 * body and upper <= body and body / rng < 0.35:
        names.append("hammer")
    return names


def compute(payload: dict[str, Any]) -> dict[str, Any]:
    bars = payload.get("bars")
    if not isinstance(bars, list) or not bars:
        raise ValueError("input.bars 须为 OHLC")
    by: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for b in bars:
        if not isinstance(b, dict):
            continue
        try:
            o, h, l, c = float(b["open"]), float(b["high"]), float(b["low"]), float(b["close"])
        except (KeyError, TypeError, ValueError):
            continue
        if min(o, h, l, c) <= 0:
            continue
        by[str(b.get("symbol") or "_")].append(
            {"date": str(b.get("date") or ""), "open": o, "high": h, "low": l, "close": c}
        )
    events: list[dict[str, Any]] = []
    for sym, rows in by.items():
        rows = sorted(rows, key=lambda r: r["date"])
        for i, r in enumerate(rows):
            for name in _pat(r["open"], r["high"], r["low"], r["close"]):
                events.append({"symbol": sym, "date": r["date"], "pattern": name, "value": 1})
            if i >= 1:
                p, q = rows[i - 1], r
                p_bull = p["close"] > p["open"]
                q_bull = q["close"] > q["open"]
                if (not p_bull) and q_bull and q["open"] <= p["close"] and q["close"] >= p["open"]:
                    events.append({"symbol": sym, "date": q["date"], "pattern": "bullish_engulfing", "value": 1})
                if p_bull and (not q_bull) and q["open"] >= p["close"] and q["close"] <= p["open"]:
                    events.append({"symbol": sym, "date": q["date"], "pattern": "bearish_engulfing", "value": 1})
    # latest signal per symbol: count recent patterns in last 5 bars
    latest: list[dict[str, Any]] = []
    for sym, rows in by.items():
        rows = sorted(rows, key=lambda r: r["date"])
        recent_dates = {r["date"] for r in rows[-5:]}
        hits = [e for e in events if e["symbol"] == sym and e["date"] in recent_dates]
        latest.append({
            "symbol": sym, "date": rows[-1]["date"] if rows else "",
            "value": len(hits), "patterns": [e["pattern"] for e in hits],
        })
    latest.sort(key=lambda x: (-x["value"], x["symbol"]))
    for i, s in enumerate(latest, 1):
        s["rank"] = i
    return {
        "ok": True, "skill": SKILL, "signal": latest,
        "series": {"events": events[-200:]},
        "metrics": {"events": len(events), "symbols": len(by)},
        "assumptions": ["仅核心形态规则；非 TA-Lib 全集；形态≠买卖建议。"],
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
