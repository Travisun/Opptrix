#!/usr/bin/env python3
"""SignalMaker 风格鳄鱼线/AO 信号序列（纯 stdlib，独立于 alligator-index-timing）。"""
from __future__ import annotations

import argparse
import json
import sys
from typing import Any, Optional, Sequence, Tuple, List, Dict

SKILL = "signal-alligator"


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


def calculate_alligator(close, periods=(13, 8, 5), lag=(8, 5, 3)):
    jaw = shift(sma(close, periods[0]), lag[0])
    teeth = shift(sma(close, periods[1]), lag[1])
    lips = shift(sma(close, periods[2]), lag[2])
    return jaw, teeth, lips


def alignment_trigger(jaw, teeth, lips, bullish: bool) -> List[bool]:
    n = len(jaw)
    aligned = [False] * n
    for i in range(n):
        a, b, c = jaw[i], teeth[i], lips[i]
        if a is None or b is None or c is None:
            continue
        aligned[i] = (a < b < c) if bullish else (a > b > c)
    trig = [False] * n
    for i in range(1, n):
        trig[i] = aligned[i] and not aligned[i - 1]
    return trig


def alligator_signal(jaw, teeth, lips, keep_pre=True):
    bull = alignment_trigger(jaw, teeth, lips, True)
    bear = alignment_trigger(jaw, teeth, lips, False)
    n = len(jaw)
    raw = [None] * n
    for i in range(n):
        if bull[i]:
            raw[i] = 1.0
        elif bear[i]:
            raw[i] = -1.0
    if not keep_pre:
        return raw
    out = []; last = 0.0
    for v in raw:
        if v is not None:
            last = v
        out.append(last)
    return out


def calculate_ao(high, low, periods=(5, 34)):
    median = [(h - l) * 0.5 for h, l in zip(high, low)]
    s5 = sma(median, periods[0]); s34 = sma(median, periods[1])
    out = []
    for a, b in zip(s5, s34):
        out.append(None if a is None or b is None else a - b)
    return out


def ao_continuation_signal(ao, window=3, keep_pre=True):
    n = len(ao)
    raw = [None] * n
    for i in range(window - 1, n):
        chunk = ao[i - window + 1 : i + 1]
        if any(v is None for v in chunk):
            continue
        diffs = [chunk[j + 1] - chunk[j] for j in range(window - 1)]
        if all(d > 0 for d in diffs):
            raw[i] = 1.0
        elif all(d < 0 for d in diffs):
            raw[i] = -1.0
    if not keep_pre:
        return raw
    out = []; last = 0.0
    for v in raw:
        if v is not None:
            last = v
        out.append(last)
    return out


def combine_signal(alli, ao_sig):
    out = []
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


def pick_symbol_bars(bars, symbol):
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


def compute(payload: dict[str, Any]) -> dict[str, Any]:
    params = payload.get("params") if isinstance(payload.get("params"), dict) else {}
    periods = tuple(params.get("periods") or (13, 8, 5))
    lag = tuple(params.get("lag") or (8, 5, 3))
    ao_window = int(params.get("ao_window") or 3)
    keep_pre = bool(params.get("keep_pre_status", True))
    symbol = params.get("symbol")
    bars_raw = payload.get("bars")
    if not isinstance(bars_raw, list) or not bars_raw:
        raise ValueError("input.bars 须为非空")
    bars = sorted(pick_symbol_bars(bars_raw, str(symbol) if symbol else None), key=lambda b: str(b.get("date", "")))
    need = max(periods) + max(lag) + 5
    if len(bars) < need:
        raise ValueError(f"bars 不足，建议≥{need}")
    dates = [str(b.get("date", "")) for b in bars]
    close = [float(b["close"]) for b in bars]
    high = [float(b.get("high", b["close"])) for b in bars]
    low = [float(b.get("low", b["close"])) for b in bars]
    sym = str(bars[0].get("symbol", ""))
    jaw, teeth, lips = calculate_alligator(close, periods=periods, lag=lag)
    alli = alligator_signal(jaw, teeth, lips, keep_pre=keep_pre)
    ao = calculate_ao(high, low)
    ao_sig = ao_continuation_signal(ao, window=ao_window, keep_pre=keep_pre)
    combined = combine_signal(alli, ao_sig)
    signal = [{"date": d, "symbol": sym, "value": v} for d, v in zip(dates, combined)]
    return {
        "ok": True,
        "skill": SKILL,
        "signal": signal,
        "series": {
            "alligator": [{"date": d, "value": v} for d, v in zip(dates, alli)],
            "ao_signal": [{"date": d, "value": v} for d, v in zip(dates, ao_sig)],
            "ao": [{"date": d, "value": v} for d, v in zip(dates, ao) if v is not None],
            "jaw": [{"date": d, "value": v} for d, v in zip(dates, jaw) if v is not None],
            "teeth": [{"date": d, "value": v} for d, v in zip(dates, teeth) if v is not None],
            "lips": [{"date": d, "value": v} for d, v in zip(dates, lips) if v is not None],
        },
        "metrics": {
            "bars": len(bars),
            "symbol": sym,
            "periods": list(periods),
            "lag": list(lag),
            "last_signal": combined[-1] if combined else 0.0,
        },
        "assumptions": [
            "SignalMaker 风格：输出信号序列；算法对照鳄鱼线择时但本 skill 独立交付。",
            "utils.sliding_window 等已内联，未单独交付 signal-utils-shared。",
            "仅标准库；无 talib。",
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
