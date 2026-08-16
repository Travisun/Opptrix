#!/usr/bin/env python3
"""SignalMaker QRS 信号生成器（纯 stdlib）。与 qrs-timing 同源，独立 skill 名。"""
from __future__ import annotations

import argparse
import json
import math
import sys
from typing import Any

SKILL = "signal-qrs"


def _mean(xs: list[float]) -> float:
    return sum(xs) / len(xs)


def _std(xs: list[float]) -> float:
    if len(xs) < 2:
        return 0.0
    m = _mean(xs)
    return math.sqrt(sum((x - m) ** 2 for x in xs) / len(xs))


def _corr(xs: list[float], ys: list[float]) -> float:
    if len(xs) != len(ys) or len(xs) < 2:
        return float("nan")
    mx, my = _mean(xs), _mean(ys)
    num = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    den = math.sqrt(sum((x - mx) ** 2 for x in xs) * sum((y - my) ** 2 for y in ys))
    return num / den if den > 0 else float("nan")


def _beta(low: list[float], high: list[float]) -> float:
    c = _corr(low, high)
    sd_l, sd_h = _std(low), _std(high)
    if not math.isfinite(c) or sd_l <= 0:
        return float("nan")
    return (sd_h / sd_l) * c


def compute(payload: dict[str, Any]) -> dict[str, Any]:
    params = payload.get("params") if isinstance(payload.get("params"), dict) else {}
    n = int(params.get("N") or 18)
    m = int(params.get("M") or 40)
    power = int(params.get("regulation_power") or params.get("n") or 2)
    buy_th = float(params.get("buy_threshold") or 0.5)
    sell_th = float(params.get("sell_threshold") or -0.5)
    bars_raw = payload.get("bars")
    if not isinstance(bars_raw, list) or not bars_raw:
        raise ValueError("input.bars 须为非空")
    cleaned = []
    for b in bars_raw:
        if not isinstance(b, dict):
            continue
        try:
            high = float(b["high"]); low = float(b["low"])
        except (KeyError, TypeError, ValueError):
            continue
        if not math.isfinite(high) or not math.isfinite(low):
            continue
        cleaned.append({"date": str(b.get("date") or ""), "symbol": str(b.get("symbol") or ""), "high": high, "low": low})
    if len(cleaned) < n + 5:
        raise ValueError("有效 high/low bars 不足")
    cleaned.sort(key=lambda r: r["date"])
    highs = [b["high"] for b in cleaned]
    lows = [b["low"] for b in cleaned]
    dates = [b["date"] for b in cleaned]
    sym = cleaned[0]["symbol"]
    beta_list: list[float | None] = [None] * len(cleaned)
    corr_list: list[float | None] = [None] * len(cleaned)
    reg_list: list[float | None] = [None] * len(cleaned)
    for i in range(n - 1, len(cleaned)):
        lo = lows[i + 1 - n : i + 1]
        hi = highs[i + 1 - n : i + 1]
        c = _corr(lo, hi)
        b = _beta(lo, hi)
        if math.isfinite(b):
            beta_list[i] = b
        if math.isfinite(c):
            corr_list[i] = c
            reg_list[i] = abs(c) ** power
    qrs: list[float | None] = [None] * len(cleaned)
    for i in range(len(cleaned)):
        if i + 1 < m:
            continue
        window = [v for v in beta_list[i + 1 - m : i + 1] if v is not None]
        if len(window) < max(2, m // 2):
            continue
        mean_b = _mean(window); sd_b = _std(window)
        if sd_b <= 0:
            continue
        z = (window[-1] - mean_b) / sd_b
        r = reg_list[i]
        if r is None:
            continue
        qrs[i] = z * r
    signal = []
    state = 0
    for i, v in enumerate(qrs):
        if v is None or not math.isfinite(v):
            continue
        if v >= buy_th:
            state = 1
        elif v <= sell_th:
            state = -1
        signal.append({"date": dates[i], "symbol": sym, "value": state, "qrs": round(v, 6)})
    return {
        "ok": True,
        "skill": SKILL,
        "signal": signal,
        "series": {
            "beta": [{"date": dates[i], "value": v} for i, v in enumerate(beta_list) if v is not None],
            "corr": [{"date": dates[i], "value": v} for i, v in enumerate(corr_list) if v is not None],
            "regulation": [{"date": dates[i], "value": v} for i, v in enumerate(reg_list) if v is not None],
            "qrs": [{"date": dates[i], "value": v} for i, v in enumerate(qrs) if v is not None],
        },
        "metrics": {
            "bars": len(cleaned), "symbol": sym, "N": n, "M": m,
            "last_qrs": signal[-1]["qrs"] if signal else None,
            "last_signal": signal[-1]["value"] if signal else None,
        },
        "assumptions": [
            "QRSCreator：窗口 high/low corr、β、β zscore × |corr|^n。",
            "与 qrs-timing 同源；本 skill 为 SignalMaker 模块名。sliding_window 已内联。",
        ],
        "errors": [],
        "meta": {"degraded": False},
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
            "ok": False,
            "skill": SKILL,
            "signal": [],
            "series": {},
            "metrics": {},
            "assumptions": [],
            "errors": [str(e)],
            "meta": {},
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
