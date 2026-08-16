#!/usr/bin/env python3
"""日频微观 W 因子规则版。纯 stdlib。"""
from __future__ import annotations

import argparse
import json
import math
import sys
from collections import defaultdict
from typing import Any

SKILL = "microstructure-w-factor"



def _data_meta(data_mode: str, used: list[str], missing: list[str] | None = None, **extra: Any) -> dict[str, Any]:
    mode = data_mode if data_mode in ("full", "proxy", "insufficient") else "proxy"
    out: dict[str, Any] = {
        "data_mode": mode,
        "degraded": mode == "proxy",
        "used_inputs": list(used),
        "missing_for_full": list(missing or []),
    }
    out.update(extra)
    return out

def compute(payload: dict[str, Any]) -> dict[str, Any]:
    params = payload.get("params") if isinstance(payload.get("params"), dict) else {}
    window = int(params.get("window") or 20)
    panels = payload.get("panels") if isinstance(payload.get("panels"), dict) else {}
    micro = panels.get("microstructure") or panels.get("w_factor")
    if isinstance(micro, list) and micro:
        scores = []
        for r in micro:
            if not isinstance(r, dict):
                continue
            sym = str(r.get("symbol") or "")
            try:
                val = float(r.get("value") if "value" in r else r.get("w"))
            except (TypeError, ValueError, KeyError):
                continue
            if not sym or not math.isfinite(val):
                continue
            scores.append({"symbol": sym, "date": str(r.get("date") or ""), "value": round(val, 8)})
        if scores:
            scores.sort(key=lambda x: (-x["value"], x["symbol"]))
            for i, s in enumerate(scores, 1):
                s["rank"] = i
            return {
                "ok": True, "skill": SKILL, "signal": scores, "series": {"w_factor": scores},
                "metrics": {"window": window, "symbols": len(scores)},
                "assumptions": ["使用 panels.microstructure/w_factor 完整微观 W。"],
                "errors": [],
                "meta": _data_meta("full", ["panels.microstructure|w_factor"], []),
            }
    bars = payload.get("bars")
    if not isinstance(bars, list) or not bars:
        raise ValueError("input.bars 须含 open/close")
    by: dict[str, list[dict[str, Any]]] = defaultdict(list)
    minuteish = 0
    for b in bars:
        if not isinstance(b, dict):
            continue
        try:
            o, c = float(b["open"]), float(b["close"])
        except (KeyError, TypeError, ValueError):
            continue
        if o <= 0 or c <= 0 or not math.isfinite(o) or not math.isfinite(c):
            continue
        dt = str(b.get("date") or "")
        if (" " in dt) or ("T" in dt) or (":" in dt):
            minuteish += 1
        by[str(b.get("symbol") or "")].append({"date": dt, "open": o, "close": c})
    scores: list[dict[str, Any]] = []
    for sym, rows in by.items():
        if not sym:
            continue
        rows = sorted(rows, key=lambda r: r["date"])
        diffs: list[float] = []
        for i in range(1, len(rows)):
            prev_c = rows[i - 1]["close"]
            o, c = rows[i]["open"], rows[i]["close"]
            if prev_c <= 0 or o <= 0:
                continue
            overnight = o / prev_c - 1.0
            day = c / o - 1.0
            diffs.append(overnight - day)
        if len(diffs) < max(5, window // 2):
            continue
        chunk = diffs[-window:]
        w = sum(chunk) / len(chunk)
        scores.append({"symbol": sym, "date": rows[-1]["date"], "value": round(w, 8)})
    if not scores:
        raise ValueError("无法计算 W")
    scores.sort(key=lambda x: (-x["value"], x["symbol"]))
    for i, s in enumerate(scores, 1):
        s["rank"] = i
    return {
        "ok": True, "skill": SKILL, "signal": scores, "series": {"w_factor": scores},
        "metrics": {"window": window, "symbols": len(scores)},
        "assumptions": [
            "分钟 bars：隔夜−日间 W 视作完整规则路径。"
            if minuteish >= max(10, len(bars) // 2)
            else "日频隔夜−日间规则版 W；非分钟微观可复现版。"
        ],
        "errors": [],
        "meta": (
            _data_meta("full", ["bars.minute"], [])
            if minuteish >= max(10, len(bars) // 2)
            else _data_meta("proxy", ["bars.daily"], ["panels.microstructure", "bars.minute"])
        ),
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
