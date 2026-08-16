#!/usr/bin/env python3
"""低延迟趋势线（LLT）择时（纯 Python）。

信号：LLT 滚动斜率向上开仓，向下平仓/空仓（默认多头开关）。
"""
from __future__ import annotations

import argparse
import json
import sys
from typing import Any, Dict, List, Optional, Sequence


SKILL = "low-lag-trendline"


def alpha_from_d(d: float) -> float:
    """常见设定 alpha = 2/(d+1)。"""
    return 2.0 / (d + 1.0)


def cal_llt(price: Sequence[float], alpha: float) -> List[float]:
    if not price:
        return []
    if len(price) == 1:
        return [price[0]]
    llt: List[float] = [price[0], price[1]]
    a = alpha
    a2 = a * a
    for i in range(2, len(price)):
        e = price[i]
        v = (
            (a - a2 / 4.0) * e
            + (a2 / 2.0) * price[i - 1]
            - (a - 3.0 * a2 / 4.0) * price[i - 2]
            + 2.0 * (1.0 - a) * llt[i - 1]
            - (1.0 - a) ** 2 * llt[i - 2]
        )
        llt.append(v)
    return llt


def rolling_slope_ratio(xs: Sequence[float], window: int) -> List[Optional[float]]:
    """mean(xs[1:])/mean(xs[:-1]) over rolling window；>1 视为向上。"""
    out: List[Optional[float]] = [None] * len(xs)
    if window < 2:
        return out
    for i in range(window - 1, len(xs)):
        chunk = xs[i + 1 - window : i + 1]
        m0 = sum(chunk[:-1]) / (window - 1)
        m1 = sum(chunk[1:]) / (window - 1)
        if m0 == 0:
            out[i] = None
        else:
            out[i] = m1 / m0
    return out


def pick_symbol_bars(bars: List[Dict[str, Any]], symbol: Optional[str]) -> List[Dict[str, Any]]:
    if not bars:
        return []
    if symbol:
        rows = [b for b in bars if str(b.get("symbol", "")) == symbol]
        if rows:
            return rows
    counts: Dict[str, int] = {}
    for b in bars:
        s = str(b.get("symbol", ""))
        counts[s] = counts.get(s, 0) + 1
    top = max(counts, key=counts.get) if counts else ""
    return [b for b in bars if str(b.get("symbol", "")) == top] if top else list(bars)


def run(payload: Dict[str, Any]) -> Dict[str, Any]:
    params = payload.get("params") or {}
    d = float(params.get("d") or params.get("period") or 20)
    alpha = float(params["alpha"]) if params.get("alpha") is not None else alpha_from_d(d)
    slope_window = int(params.get("slope_window") or 5)
    symbol = params.get("symbol")
    # price_above: 可选叠加收盘在 LLT 上方过滤
    use_price_filter = bool(params.get("price_filter", False))

    bars = sorted(pick_symbol_bars(list(payload.get("bars") or []), symbol), key=lambda b: str(b.get("date", "")))
    if len(bars) < max(5, slope_window + 2):
        return {
            "ok": False,
            "skill": SKILL,
            "signal": [],
            "series": {},
            "metrics": {},
            "assumptions": [],
            "errors": [f"bars 不足：需要至少 {max(5, slope_window + 2)} 根"],
            "meta": {},
        }

    dates = [str(b.get("date", "")) for b in bars]
    close = [float(b["close"]) for b in bars]
    sym = str(bars[0].get("symbol", ""))

    llt = cal_llt(close, alpha)
    slope = rolling_slope_ratio(llt, slope_window)

    signal_vals: List[float] = []
    for i, s in enumerate(slope):
        if s is None:
            signal_vals.append(0.0)
            continue
        pos = 1.0 if s > 1.0 else 0.0
        if use_price_filter and pos > 0 and close[i] < llt[i]:
            pos = 0.0
        signal_vals.append(pos)

    signal = [{"date": d_, "symbol": sym, "value": v} for d_, v in zip(dates, signal_vals)]
    series = {
        "llt": [{"date": d_, "value": v} for d_, v in zip(dates, llt)],
        "llt_slope_ratio": [{"date": d_, "value": v} for d_, v in zip(dates, slope) if v is not None],
    }
    metrics = {
        "bars": len(bars),
        "symbol": sym,
        "d": d,
        "alpha": alpha,
        "slope_window": slope_window,
        "last_signal": signal_vals[-1] if signal_vals else 0.0,
        "last_llt": llt[-1] if llt else None,
        "in_position_days": sum(1 for v in signal_vals if v > 0),
        "sample_note": "示意样本统计，非实盘胜率",
    }
    return {
        "ok": True,
        "skill": SKILL,
        "signal": signal,
        "series": series,
        "metrics": metrics,
        "assumptions": [
            f"LLT alpha={alpha:.6f}（由 d={d} 或 params.alpha 给定）",
            "信号：LLT 滚动斜率比 >1 记多头持仓 1，否则 0（默认不做空）",
        ],
        "errors": [],
        "meta": {"degraded": False},
    }


def main(argv: Optional[Sequence[str]] = None) -> int:
    p = argparse.ArgumentParser(description=SKILL)
    p.add_argument("--input", required=True)
    p.add_argument("--output")
    args = p.parse_args(argv)
    try:
        with open(args.input, "r", encoding="utf-8") as f:
            payload = json.load(f)
        result = run(payload)
        text = json.dumps(result, ensure_ascii=False, indent=2)
        if args.output:
            with open(args.output, "w", encoding="utf-8") as f:
                f.write(text)
                f.write("\n")
        print(text)
        return 0 if result.get("ok") else 1
    except Exception as exc:  # noqa: BLE001
        err = {"ok": False, "skill": SKILL, "signal": [], "series": {}, "metrics": {}, "assumptions": [], "errors": [str(exc)], "meta": {}}
        print(json.dumps(err, ensure_ascii=False, indent=2))
        print(str(exc), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
