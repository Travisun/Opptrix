#!/usr/bin/env python3
"""均线收敛发散因子（纯 Python）。

参照开源证券《开源量化评论（91）：形态识别，均线的收敛与发散》
FactorArithmetic/convergence_factor.py：
factor = -log(1 + std([close, MA_w1, MA_w2, ...], ddof=1))
值越大表示越收敛。
"""
from __future__ import annotations

import argparse
import json
import math
import sys
from typing import Any, Dict, List, Optional, Sequence


SKILL = "ma-converge-diverge"


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


def sample_std(vals: Sequence[float]) -> float:
    n = len(vals)
    if n < 2:
        return 0.0
    m = sum(vals) / n
    return math.sqrt(sum((v - m) ** 2 for v in vals) / (n - 1))


def convergence_factor(
    close: Sequence[float],
    windows: Sequence[int],
) -> List[Optional[float]]:
    """含价格自身 + 各窗口均线，再算截面标准差。"""
    ma_list = [sma(close, w) for w in windows]
    out: List[Optional[float]] = [None] * len(close)
    for i in range(len(close)):
        vals = [close[i]]
        ok = True
        for series in ma_list:
            v = series[i]
            if v is None:
                ok = False
                break
            vals.append(float(v))
        if not ok:
            continue
        std = sample_std(vals)
        out[i] = -math.log(1.0 + std)
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
    windows = params.get("windows") or [5, 10, 20, 60]
    windows = [int(w) for w in windows]
    symbol = params.get("symbol")
    # 信号：因子上升（更收敛）记 1，下降记 -1，持平 0；可用 zscore 阈值
    signal_mode = str(params.get("signal_mode") or "delta").lower()
    z_window = int(params.get("z_window") or 60)

    bars = sorted(pick_symbol_bars(list(payload.get("bars") or []), symbol), key=lambda b: str(b.get("date", "")))
    need = max(windows) + 2
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

    factor = convergence_factor(close, windows)

    # optional zscore of factor
    zscore: List[Optional[float]] = [None] * len(factor)
    for i in range(len(factor)):
        if i + 1 < z_window:
            continue
        chunk = factor[i + 1 - z_window : i + 1]
        if any(v is None for v in chunk):
            continue
        vals = [float(v) for v in chunk]  # type: ignore[arg-type]
        m = sum(vals) / z_window
        var = sum((v - m) ** 2 for v in vals) / (z_window - 1)
        s = math.sqrt(var)
        if s == 0 or factor[i] is None:
            continue
        zscore[i] = (float(factor[i]) - m) / s

    signal_vals: List[float] = []
    for i, f in enumerate(factor):
        if f is None:
            signal_vals.append(0.0)
            continue
        if signal_mode == "zscore":
            z = zscore[i]
            if z is None:
                signal_vals.append(0.0)
            elif z > 0:
                signal_vals.append(1.0)  # 相对更收敛
            elif z < 0:
                signal_vals.append(-1.0)  # 相对更发散
            else:
                signal_vals.append(0.0)
        else:
            if i == 0 or factor[i - 1] is None:
                signal_vals.append(0.0)
            else:
                dlt = float(f) - float(factor[i - 1])
                if dlt > 0:
                    signal_vals.append(1.0)
                elif dlt < 0:
                    signal_vals.append(-1.0)
                else:
                    signal_vals.append(0.0)

    signal = [{"date": d, "symbol": sym, "value": v} for d, v in zip(dates, signal_vals)]
    series = {
        "convergence_factor": [{"date": d, "value": v} for d, v in zip(dates, factor) if v is not None],
        "factor_zscore": [{"date": d, "value": v} for d, v in zip(dates, zscore) if v is not None],
    }
    last_f = next((v for v in reversed(factor) if v is not None), None)
    metrics = {
        "bars": len(bars),
        "symbol": sym,
        "windows": windows,
        "signal_mode": signal_mode,
        "last_factor": last_f,
        "last_signal": signal_vals[-1] if signal_vals else 0.0,
        "converge_days": sum(1 for v in signal_vals if v > 0),
        "diverge_days": sum(1 for v in signal_vals if v < 0),
        "sample_note": "示意样本统计；因子越大越收敛",
    }
    return {
        "ok": True,
        "skill": SKILL,
        "signal": signal,
        "series": series,
        "metrics": metrics,
        "assumptions": [
            "因子 = -log(1+std([close]+MAs, ddof=1))，与开源证券 91 口径一致",
            f"signal_mode={signal_mode}：delta=因子一阶差分方向；zscore=相对滚动标准化",
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
