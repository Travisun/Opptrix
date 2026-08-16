#!/usr/bin/env python3
"""VMACD_MTM 价量共振择时（纯 Python MACD，无 talib）。

东北证券《成交量择时指标 VMACD_MTM》。
"""
from __future__ import annotations

import argparse
import json
import math
import sys
from typing import Any, Dict, List, Optional, Sequence


SKILL = "vmacd-mtm-timing"


def ema(xs: Sequence[Optional[float]], n: int) -> List[Optional[float]]:
    out: List[Optional[float]] = [None] * len(xs)
    if n <= 0 or not xs:
        return out
    k = 2.0 / (n + 1)
    seed_sum = 0.0
    seed_count = 0
    prev: Optional[float] = None
    for i, v in enumerate(xs):
        if v is None:
            out[i] = None
            prev = None
            seed_sum = 0.0
            seed_count = 0
            continue
        if prev is None:
            seed_sum += v
            seed_count += 1
            if seed_count == n:
                prev = seed_sum / n
                out[i] = prev
            else:
                out[i] = None
        else:
            prev = k * v + (1 - k) * prev
            out[i] = prev
    return out


def macd_hist(
    xs: Sequence[float],
    fast: int = 12,
    slow: int = 26,
    signal: int = 9,
) -> List[Optional[float]]:
    """talib.MACD(...)[-1] = hist = DIF - DEA。"""
    series: List[Optional[float]] = list(xs)
    dif_raw = []
    ef = ema(series, fast)
    es = ema(series, slow)
    for a, b in zip(ef, es):
        if a is None or b is None:
            dif_raw.append(None)
        else:
            dif_raw.append(a - b)
    dea = ema(dif_raw, signal)
    hist: List[Optional[float]] = []
    for d, e in zip(dif_raw, dea):
        if d is None or e is None:
            hist.append(None)
        else:
            hist.append(d - e)
    return hist


def rolling_mean_std(
    xs: Sequence[Optional[float]], window: int
) -> tuple[List[Optional[float]], List[Optional[float]]]:
    means: List[Optional[float]] = [None] * len(xs)
    stds: List[Optional[float]] = [None] * len(xs)
    for i in range(len(xs)):
        if i + 1 < window:
            continue
        chunk = xs[i + 1 - window : i + 1]
        if any(v is None for v in chunk):
            continue
        vals = [float(v) for v in chunk]  # type: ignore[arg-type]
        m = sum(vals) / window
        var = sum((v - m) ** 2 for v in vals) / (window - 1) if window > 1 else 0.0
        means[i] = m
        stds[i] = math.sqrt(var)
    return means, stds


def calc_vmacd_mtm(
    volume: Sequence[float],
    period: int = 60,
    fast: int = 12,
    slow: int = 26,
    signal: int = 9,
) -> List[Optional[float]]:
    vmacd = macd_hist(volume, fast=fast, slow=slow, signal=signal)
    means, stds = rolling_mean_std(vmacd, period)
    zscore: List[Optional[float]] = []
    for v, m, s in zip(vmacd, means, stds):
        if v is None or m is None or s is None or s == 0:
            zscore.append(None)
        else:
            zscore.append((v - m) / s)
    diffs: List[Optional[float]] = [None]
    for i in range(1, len(zscore)):
        a, b = zscore[i - 1], zscore[i]
        if a is None or b is None:
            diffs.append(None)
        else:
            diffs.append(b - a)
    # rolling sum of diffs over `period`
    out: List[Optional[float]] = [None] * len(diffs)
    for i in range(len(diffs)):
        if i + 1 < period:
            continue
        chunk = diffs[i + 1 - period : i + 1]
        if any(v is None for v in chunk):
            continue
        out[i] = sum(float(v) for v in chunk)  # type: ignore[arg-type]
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
    period = int(params.get("period") or 60)
    fast = int(params.get("fast") or 12)
    slow = int(params.get("slow") or 26)
    signal_n = int(params.get("signal") or 9)
    symbol = params.get("symbol")

    bars = sorted(pick_symbol_bars(list(payload.get("bars") or []), symbol), key=lambda b: str(b.get("date", "")))
    need = period + slow + signal_n + 2
    if len(bars) < need:
        return {
            "ok": False,
            "skill": SKILL,
            "signal": [],
            "series": {},
            "metrics": {},
            "assumptions": [],
            "errors": [f"bars 不足：建议至少 {need} 根（period={period}）"],
            "meta": {},
        }

    dates = [str(b.get("date", "")) for b in bars]
    volume = [float(b.get("volume") or 0.0) for b in bars]
    close = [float(b["close"]) for b in bars]
    sym = str(bars[0].get("symbol", ""))

    mtm = calc_vmacd_mtm(volume, period=period, fast=fast, slow=slow, signal=signal_n)
    # 价量共振：VMACD_MTM 方向 + 价格动量同向则强化
    price_mom: List[Optional[float]] = [None] * len(close)
    for i in range(period, len(close)):
        price_mom[i] = close[i] / close[i - period] - 1.0

    signal_vals: List[float] = []
    for i, v in enumerate(mtm):
        if v is None:
            signal_vals.append(0.0)
            continue
        base = 1.0 if v > 0 else (-1.0 if v < 0 else 0.0)
        pm = price_mom[i]
        if pm is not None:
            if (base > 0 and pm > 0) or (base < 0 and pm < 0):
                signal_vals.append(base)
            elif base == 0:
                signal_vals.append(0.0)
            else:
                signal_vals.append(0.0)  # 价量背离归零
        else:
            signal_vals.append(base)

    signal = [{"date": d, "symbol": sym, "value": v} for d, v in zip(dates, signal_vals)]
    series = {
        "vmacd_mtm": [{"date": d, "value": v} for d, v in zip(dates, mtm) if v is not None],
        "price_momentum": [{"date": d, "value": v} for d, v in zip(dates, price_mom) if v is not None],
    }
    last_mtm = next((v for v in reversed(mtm) if v is not None), None)
    metrics = {
        "bars": len(bars),
        "symbol": sym,
        "period": period,
        "last_vmacd_mtm": last_mtm,
        "last_signal": signal_vals[-1] if signal_vals else 0.0,
        "resonance_long": sum(1 for v in signal_vals if v > 0),
        "resonance_short": sum(1 for v in signal_vals if v < 0),
        "sample_note": "示意样本统计，非实盘胜率",
    }
    return {
        "ok": True,
        "skill": SKILL,
        "signal": signal,
        "series": series,
        "metrics": metrics,
        "assumptions": [
            "VMACD 为成交量序列 MACD 柱（DIF-DEA），纯 Python EMA 实现",
            "信号=VMACD_MTM 方向与 period 收益同向共振；背离记 0",
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
