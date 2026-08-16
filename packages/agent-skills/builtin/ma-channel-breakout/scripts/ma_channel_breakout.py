#!/usr/bin/env python3
"""均线交叉 + 通道突破择时（纯 Python）。

参照申万宏源《均线交叉结合通道突破择时研究》notebook 核心规则：
金叉后 N 日内创近 N 日新高开仓；死叉后 N 日内触及近 N 日低点平仓。
"""
from __future__ import annotations

import argparse
import json
import sys
from typing import Any, Dict, List, Optional, Sequence


SKILL = "ma-channel-breakout"


def sma(xs: Sequence[float], n: int) -> List[Optional[float]]:
    out: List[Optional[float]] = [None] * len(xs)
    if n <= 0:
        return out
    s = 0.0
    for i, v in enumerate(xs):
        s += v
        if i >= n:
            s -= xs[i - n]
        if i >= n - 1:
            out[i] = s / n
    return out


def ema(xs: Sequence[float], n: int) -> List[Optional[float]]:
    out: List[Optional[float]] = [None] * len(xs)
    if n <= 0 or not xs:
        return out
    k = 2.0 / (n + 1)
    seed = 0.0
    for i, v in enumerate(xs):
        if i < n:
            seed += v
            if i == n - 1:
                out[i] = seed / n
            continue
        prev = out[i - 1]
        if prev is None:
            out[i] = None
            continue
        out[i] = k * v + (1 - k) * prev
    return out


def wma(xs: Sequence[float], n: int) -> List[Optional[float]]:
    out: List[Optional[float]] = [None] * len(xs)
    if n <= 0:
        return out
    denom = n * (n + 1) / 2.0
    for i in range(n - 1, len(xs)):
        chunk = xs[i + 1 - n : i + 1]
        wsum = sum((j + 1) * chunk[j] for j in range(n))
        out[i] = wsum / denom
    return out


def ma_series(xs: Sequence[float], n: int, method: str) -> List[Optional[float]]:
    m = method.upper()
    if m == "EMA":
        return ema(xs, n)
    if m == "WMA":
        return wma(xs, n)
    return sma(xs, n)


def golden_fork(s, l, s_pre, l_pre) -> bool:
    if None in (s, l, s_pre, l_pre):
        return False
    return s > l and s_pre < l_pre


def dead_fork(s, l, s_pre, l_pre) -> bool:
    if None in (s, l, s_pre, l_pre):
        return False
    return s < l and s_pre > l_pre


def rolling_max(xs: Sequence[float], n: int) -> List[Optional[float]]:
    out: List[Optional[float]] = [None] * len(xs)
    for i in range(n - 1, len(xs)):
        out[i] = max(xs[i + 1 - n : i + 1])
    return out


def rolling_min(xs: Sequence[float], n: int) -> List[Optional[float]]:
    out: List[Optional[float]] = [None] * len(xs)
    for i in range(n - 1, len(xs)):
        out[i] = min(xs[i + 1 - n : i + 1])
    return out


def channel_breakout_position(
    close: Sequence[float],
    s_ma: Sequence[Optional[float]],
    l_ma: Sequence[Optional[float]],
    channel_n: int,
) -> List[float]:
    n = len(close)
    hi = rolling_max(close, channel_n)
    lo = rolling_min(close, channel_n)
    open_s = [False] * n
    close_s = [False] * n
    for i in range(1, n):
        open_s[i] = golden_fork(s_ma[i], l_ma[i], s_ma[i - 1], l_ma[i - 1])
        close_s[i] = dead_fork(s_ma[i], l_ma[i], s_ma[i - 1], l_ma[i - 1])

    # 近 N 期是否出现金叉/死叉
    lag_open = [0] * n
    lag_close = [0] * n
    for i in range(n):
        start = max(0, i + 1 - channel_n)
        lag_open[i] = sum(1 for j in range(start, i + 1) if open_s[j])
        lag_close[i] = sum(1 for j in range(start, i + 1) if close_s[j])

    # notebook: O_S = (CLOSE >= HIGH) & LAG_OPEN；C_S = (CLOSE >= LOW) & LAG_CLOSE — 卖出条件原文写 >= LOW，
    # 语义上应为触及低点附近；保留研报写法并用 MARK 状态机。
    position: List[float] = []
    pos = 0.0
    for i in range(n):
        mark = 0
        if hi[i] is not None and lag_open[i] and close[i] >= hi[i]:
            mark = 1
        if lo[i] is not None and lag_close[i] and close[i] <= lo[i]:
            # 修正为触及/跌破近 N 低点平仓，并在 assumptions 声明与原文 >= 的差异
            mark = -1
        if mark == -1:
            pos = 0.0
        elif mark == 1:
            pos = 1.0
        position.append(pos)
    return position


def double_ma_position(
    s_ma: Sequence[Optional[float]],
    l_ma: Sequence[Optional[float]],
) -> List[float]:
    pos = 0.0
    out: List[float] = []
    for i in range(len(s_ma)):
        if i == 0:
            out.append(0.0)
            continue
        if golden_fork(s_ma[i], l_ma[i], s_ma[i - 1], l_ma[i - 1]):
            pos = 1.0
        elif dead_fork(s_ma[i], l_ma[i], s_ma[i - 1], l_ma[i - 1]):
            pos = 0.0
        out.append(pos)
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
    short = int(params.get("short") or 9)
    long = int(params.get("long") or (2 * short))
    channel_n = int(params.get("channel_n") or params.get("N") or 3)
    method = str(params.get("method") or "SMA")
    mode = str(params.get("mode") or "channel").lower()  # channel | cross
    symbol = params.get("symbol")

    bars = sorted(pick_symbol_bars(list(payload.get("bars") or []), symbol), key=lambda b: str(b.get("date", "")))
    need = long + channel_n + 2
    if len(bars) < need:
        return {
            "ok": False,
            "skill": SKILL,
            "signal": [],
            "series": {},
            "metrics": {},
            "assumptions": [],
            "errors": [f"bars 不足：需要至少 {need} 根"],
            "meta": {},
        }

    dates = [str(b.get("date", "")) for b in bars]
    close = [float(b["close"]) for b in bars]
    sym = str(bars[0].get("symbol", ""))

    s_ma = ma_series(close, short, method)
    l_ma = ma_series(close, long, method)

    if mode == "cross":
        pos = double_ma_position(s_ma, l_ma)
        assumptions = ["模式=纯双均线金叉/死叉持仓（1/0）"]
    else:
        pos = channel_breakout_position(close, s_ma, l_ma, channel_n)
        assumptions = [
            "模式=均线交叉结合通道突破：金叉后近 N 日创新高开仓，死叉后近 N 日跌破低点平仓",
            "平仓条件对原文 CLOSE>=LOW 做了 CLOSE<=LOW 语义修正（见 series 对照）",
        ]

    signal = [{"date": d, "symbol": sym, "value": v} for d, v in zip(dates, pos)]
    series = {
        "s_ma": [{"date": d, "value": v} for d, v in zip(dates, s_ma) if v is not None],
        "l_ma": [{"date": d, "value": v} for d, v in zip(dates, l_ma) if v is not None],
        "close": [{"date": d, "value": v} for d, v in zip(dates, close)],
    }
    metrics = {
        "bars": len(bars),
        "symbol": sym,
        "short": short,
        "long": long,
        "channel_n": channel_n,
        "method": method.upper(),
        "mode": mode,
        "last_signal": pos[-1] if pos else 0.0,
        "in_position_days": sum(1 for v in pos if v > 0),
        "sample_note": "示意样本统计，非实盘胜率",
    }
    return {
        "ok": True,
        "skill": SKILL,
        "signal": signal,
        "series": series,
        "metrics": metrics,
        "assumptions": assumptions,
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
