#!/usr/bin/env python3
"""聪明钱因子：分钟/逐笔 full，日频 proxy。纯 stdlib。"""
from __future__ import annotations

import argparse
import json
import math
import sys
from collections import defaultdict
from typing import Any

SKILL = "smart-money-factor"



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

def _load_bars(payload: dict[str, Any]) -> list[dict[str, Any]]:
    bars = payload.get("bars")
    if not isinstance(bars, list) or not bars:
        raise ValueError("input.bars 须为非空 OHLCV")
    out: list[dict[str, Any]] = []
    for b in bars:
        if not isinstance(b, dict):
            continue
        try:
            o, h, l, c = float(b["open"]), float(b["high"]), float(b["low"]), float(b["close"])
            v = float(b.get("volume") or 0)
        except (KeyError, TypeError, ValueError):
            continue
        if min(o, h, l, c) <= 0 or not all(math.isfinite(x) for x in (o, h, l, c, v)):
            continue
        out.append({"symbol": str(b.get("symbol") or ""), "date": str(b.get("date") or ""),
                    "open": o, "high": h, "low": l, "close": c, "volume": max(v, 0.0)})
    if len(out) < 5:
        raise ValueError("有效 bars 不足")
    return out


def _is_minute_bar(b: dict[str, Any]) -> bool:
    dt = str(b.get("datetime") or b.get("date") or "")
    return (" " in dt) or ("T" in dt) or (":" in dt)


def compute(payload: dict[str, Any]) -> dict[str, Any]:
    params = payload.get("params") if isinstance(payload.get("params"), dict) else {}
    window = int(params.get("window") or 20)
    panels = payload.get("panels") if isinstance(payload.get("panels"), dict) else {}
    ticks = panels.get("ticks")
    missing_full = ["panels.ticks", "bars.minute"]
    used: list[str] = []
    by: dict[str, list[dict[str, Any]]] = defaultdict(list)
    data_mode = "proxy"

    if isinstance(ticks, list) and ticks:
        for b in ticks:
            if not isinstance(b, dict):
                continue
            try:
                o = float(b.get("open") or b.get("price") or b.get("close") or 0)
                h = float(b.get("high") or o)
                l = float(b.get("low") or o)
                c = float(b.get("close") or b.get("price") or o)
                v = float(b.get("volume") or b.get("qty") or 0)
            except (TypeError, ValueError):
                continue
            if min(o, h, l, c) <= 0:
                continue
            by[str(b.get("symbol") or "")].append({
                "symbol": str(b.get("symbol") or ""),
                "date": str(b.get("datetime") or b.get("date") or ""),
                "open": o, "high": h, "low": l, "close": c, "volume": max(v, 0.0),
            })
        used = ["panels.ticks"]
        data_mode = "full"
        assumptions = [
            "使用 panels.ticks 微观代理聪明钱方向强度。",
            "溯源开源证券聪明钱 2.0 思路，非研报可复现回测。",
        ]
    else:
        bars = _load_bars(payload)
        minute_n = sum(1 for b in bars if _is_minute_bar(b))
        for b in bars:
            by[b["symbol"]].append(b)
        if minute_n >= max(10, len(bars) // 2):
            used = ["bars.minute"]
            data_mode = "full"
            assumptions = [
                "bars 判定为分钟频：按日内量价构造聪明钱强度。",
                "溯源开源证券聪明钱 2.0 思路，非研报可复现回测。",
            ]
            missing_full = ["panels.ticks"]
        else:
            used = ["bars.daily"]
            data_mode = "proxy"
            assumptions = [
                "无分钟/逐笔：日 OHLCV 代理聪明钱方向强度。",
                "溯源开源证券聪明钱 2.0 思路，非研报可复现回测。",
            ]

    scores: list[dict[str, Any]] = []
    for sym, rows in by.items():
        if not sym:
            continue
        rows = sorted(rows, key=lambda r: r["date"])
        if len(rows) < max(5, window // 2):
            continue
        chunk = rows[-window:]
        vals: list[float] = []
        for r in chunk:
            rng = r["high"] - r["low"]
            if rng <= 1e-12:
                continue
            body = (r["close"] - r["open"]) / rng
            vals.append(body * math.log1p(r["volume"]))
        if not vals:
            continue
        scores.append({"symbol": sym, "date": chunk[-1]["date"], "value": sum(vals) / len(vals)})
    if not scores:
        return {
            "ok": False, "skill": SKILL, "signal": [], "series": {}, "metrics": {},
            "assumptions": assumptions,
            "errors": ["无法计算聪明钱：有效样本不足"],
            "meta": _data_meta("insufficient", used, missing_full),
        }
    scores.sort(key=lambda x: (-x["value"], x["symbol"]))
    for i, s in enumerate(scores, 1):
        s["rank"] = i
        s["value"] = round(s["value"], 8)
    return {
        "ok": True, "skill": SKILL, "signal": scores,
        "series": {"smart_money": scores},
        "metrics": {"window": window, "symbols": len(scores), "sample_note": "示意截面"},
        "assumptions": assumptions,
        "errors": [],
        "meta": _data_meta(data_mode, used, [] if data_mode == "full" else missing_full),
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
