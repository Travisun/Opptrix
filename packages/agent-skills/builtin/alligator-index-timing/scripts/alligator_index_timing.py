#!/usr/bin/env python3
"""鳄鱼线 + AO 指数择时（纯 Python，无 talib）。

C-择时类/基于鳄鱼线的指数择时及轮动策略。
"""
from __future__ import annotations

import argparse
import json
import sys
from typing import Any, Dict, List, Optional, Sequence, Tuple


SKILL = "alligator-index-timing"


def sma(xs: Sequence[float], n: int) -> List[Optional[float]]:
    out: List[Optional[float]] = [None] * len(xs)
    if n <= 0 or not xs:
        return out
    s = 0.0
    for i, v in enumerate(xs):
        s += v
        if i >= n:
            s -= xs[i - n]
        if i >= n - 1:
            out[i] = s / n
    return out


def shift(xs: Sequence[Optional[float]], periods: int) -> List[Optional[float]]:
    n = len(xs)
    out: List[Optional[float]] = [None] * n
    if periods == 0:
        return list(xs)
    if periods > 0:
        for i in range(periods, n):
            out[i] = xs[i - periods]
    else:
        k = -periods
        for i in range(0, n - k):
            out[i] = xs[i + k]
    return out


def calculate_alligator(
    close: Sequence[float],
    periods: Tuple[int, int, int] = (13, 8, 5),
    lag: Tuple[int, int, int] = (8, 5, 3),
) -> Tuple[List[Optional[float]], List[Optional[float]], List[Optional[float]]]:
    """返回 (jaw/下颚, teeth/牙齿, lips/上唇)。"""
    jaw = shift(sma(close, periods[0]), lag[0])
    teeth = shift(sma(close, periods[1]), lag[1])
    lips = shift(sma(close, periods[2]), lag[2])
    return jaw, teeth, lips


def alignment_trigger(
    jaw: Sequence[Optional[float]],
    teeth: Sequence[Optional[float]],
    lips: Sequence[Optional[float]],
    bullish: bool,
) -> List[bool]:
    n = len(jaw)
    aligned = [False] * n
    for i in range(n):
        a, b, c = jaw[i], teeth[i], lips[i]
        if a is None or b is None or c is None:
            continue
        if bullish:
            aligned[i] = a < b < c
        else:
            aligned[i] = a > b > c
    trig = [False] * n
    for i in range(1, n):
        trig[i] = aligned[i] and not aligned[i - 1]
    return trig


def alligator_signal(
    jaw: Sequence[Optional[float]],
    teeth: Sequence[Optional[float]],
    lips: Sequence[Optional[float]],
    keep_pre: bool = True,
) -> List[Optional[float]]:
    bull = alignment_trigger(jaw, teeth, lips, True)
    bear = alignment_trigger(jaw, teeth, lips, False)
    n = len(jaw)
    raw: List[Optional[float]] = [None] * n
    for i in range(n):
        if bull[i]:
            raw[i] = 1.0
        elif bear[i]:
            raw[i] = -1.0
    if not keep_pre:
        return raw
    out: List[Optional[float]] = []
    last = 0.0
    for v in raw:
        if v is not None:
            last = v
        out.append(last)
    return out


def calculate_ao(
    high: Sequence[float],
    low: Sequence[float],
    periods: Tuple[int, int] = (5, 34),
) -> List[Optional[float]]:
    """研报口径：median=(high-low)*0.5；AO=SMA(median,5)-SMA(median,34)。"""
    median = [(h - l) * 0.5 for h, l in zip(high, low)]
    s5 = sma(median, periods[0])
    s34 = sma(median, periods[1])
    out: List[Optional[float]] = []
    for a, b in zip(s5, s34):
        if a is None or b is None:
            out.append(None)
        else:
            out.append(a - b)
    return out


def ao_continuation_signal(
    ao: Sequence[Optional[float]],
    window: int = 3,
    keep_pre: bool = True,
) -> List[Optional[float]]:
    n = len(ao)
    raw: List[Optional[float]] = [None] * n
    for i in range(window - 1, n):
        chunk = ao[i - window + 1 : i + 1]
        if any(v is None for v in chunk):
            continue
        diffs = [chunk[j + 1] - chunk[j] for j in range(window - 1)]  # type: ignore[operator]
        if all(d > 0 for d in diffs):
            raw[i] = 1.0
        elif all(d < 0 for d in diffs):
            raw[i] = -1.0
    if not keep_pre:
        return raw
    out: List[Optional[float]] = []
    last = 0.0
    for v in raw:
        if v is not None:
            last = v
        out.append(last)
    return out


def combine_signal(
    alli: Sequence[Optional[float]],
    ao_sig: Sequence[Optional[float]],
) -> List[float]:
    """同向共振取方向；冲突取 0；单侧有值则取该侧。"""
    out: List[float] = []
    for a, b in zip(alli, ao_sig):
        aa = 0.0 if a is None else float(a)
        bb = 0.0 if b is None else float(b)
        if aa == 0 and bb == 0:
            out.append(0.0)
        elif aa == 0:
            out.append(bb)
        elif bb == 0:
            out.append(aa)
        elif aa == bb:
            out.append(aa)
        else:
            out.append(0.0)
    return out


def pick_symbol_bars(bars: List[Dict[str, Any]], symbol: Optional[str]) -> List[Dict[str, Any]]:
    if not bars:
        return []
    if symbol:
        rows = [b for b in bars if str(b.get("symbol", "")) == symbol]
        if rows:
            return rows
    # 默认取出现次数最多的 symbol
    counts: Dict[str, int] = {}
    for b in bars:
        s = str(b.get("symbol", ""))
        counts[s] = counts.get(s, 0) + 1
    top = max(counts, key=counts.get) if counts else ""
    return [b for b in bars if str(b.get("symbol", "")) == top] if top else list(bars)


def sort_bars(bars: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    return sorted(bars, key=lambda b: str(b.get("date", "")))


def run(payload: Dict[str, Any]) -> Dict[str, Any]:
    params = payload.get("params") or {}
    periods = tuple(params.get("periods") or (13, 8, 5))
    lag = tuple(params.get("lag") or (8, 5, 3))
    ao_window = int(params.get("ao_window") or 3)
    symbol = params.get("symbol")
    keep_pre = bool(params.get("keep_pre_status", True))

    bars = sort_bars(pick_symbol_bars(list(payload.get("bars") or []), symbol))
    assumptions: List[str] = []
    errors: List[str] = []

    if len(bars) < max(periods) + max(lag):
        return {
            "ok": False,
            "skill": SKILL,
            "signal": [],
            "series": {},
            "metrics": {},
            "assumptions": assumptions,
            "errors": [f"bars 不足：需要至少 {max(periods) + max(lag)} 根"],
            "meta": {},
        }

    dates = [str(b.get("date", "")) for b in bars]
    close = [float(b["close"]) for b in bars]
    high = [float(b.get("high", b["close"])) for b in bars]
    low = [float(b.get("low", b["close"])) for b in bars]
    sym = str(bars[0].get("symbol", ""))

    jaw, teeth, lips = calculate_alligator(close, periods=periods, lag=lag)  # type: ignore[arg-type]
    alli = alligator_signal(jaw, teeth, lips, keep_pre=keep_pre)
    ao = calculate_ao(high, low)
    ao_sig = ao_continuation_signal(ao, window=ao_window, keep_pre=keep_pre)
    combined = combine_signal(alli, ao_sig)

    signal = [{"date": d, "symbol": sym, "value": v} for d, v in zip(dates, combined)]
    series = {
        "jaw": [{"date": d, "value": v} for d, v in zip(dates, jaw) if v is not None],
        "teeth": [{"date": d, "value": v} for d, v in zip(dates, teeth) if v is not None],
        "lips": [{"date": d, "value": v} for d, v in zip(dates, lips) if v is not None],
        "ao": [{"date": d, "value": v} for d, v in zip(dates, ao) if v is not None],
        "alligator_signal": [{"date": d, "value": v} for d, v in zip(dates, alli)],
        "ao_signal": [{"date": d, "value": v} for d, v in zip(dates, ao_sig)],
    }

    last = combined[-1] if combined else 0.0
    metrics = {
        "bars": len(bars),
        "symbol": sym,
        "last_signal": last,
        "long_days": sum(1 for v in combined if v > 0),
        "short_days": sum(1 for v in combined if v < 0),
        "flat_days": sum(1 for v in combined if v == 0),
        "sample_note": "示意样本统计，非实盘胜率",
    }
    assumptions.append("AO 采用研报口径 SMA((H-L)/2,5)-SMA((H-L)/2,34)，非 TradingView median price")
    assumptions.append("组合信号：鳄鱼线与 AO 同向共振；冲突归零")

    return {
        "ok": True,
        "skill": SKILL,
        "signal": signal,
        "series": series,
        "metrics": metrics,
        "assumptions": assumptions,
        "errors": errors,
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
    except Exception as exc:  # noqa: BLE001 — CLI 边界
        err = {"ok": False, "skill": SKILL, "signal": [], "series": {}, "metrics": {}, "assumptions": [], "errors": [str(exc)], "meta": {}}
        print(json.dumps(err, ensure_ascii=False, indent=2))
        print(str(exc), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
