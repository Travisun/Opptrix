#!/usr/bin/env python3
"""SignalMaker VMACD_MTM 信号模块（纯 Python MACD，无 talib）。"""
from __future__ import annotations

import argparse
import json
import math
import sys
from typing import Any, List, Optional, Sequence

SKILL = "signal-vmacd-mtm"


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


def macd_hist(xs: Sequence[float], fast=12, slow=26, signal=9) -> List[Optional[float]]:
    series: List[Optional[float]] = list(xs)
    ef = ema(series, fast); es = ema(series, slow)
    dif = [None if a is None or b is None else a - b for a, b in zip(ef, es)]
    dea = ema(dif, signal)
    return [None if d is None or e is None else d - e for d, e in zip(dif, dea)]


def calc_vmacd_mtm(volume: Sequence[float], period=60, fast=12, slow=26, signal=9):
    vmacd = macd_hist(volume, fast=fast, slow=slow, signal=signal)
    means: List[Optional[float]] = [None] * len(vmacd)
    stds: List[Optional[float]] = [None] * len(vmacd)
    for i in range(len(vmacd)):
        if i + 1 < period:
            continue
        chunk = vmacd[i + 1 - period : i + 1]
        if any(v is None for v in chunk):
            continue
        vals = [float(v) for v in chunk]  # type: ignore[arg-type]
        m = sum(vals) / period
        var = sum((v - m) ** 2 for v in vals) / (period - 1) if period > 1 else 0.0
        means[i] = m; stds[i] = math.sqrt(var)
    zscore: List[Optional[float]] = []
    for v, m, s in zip(vmacd, means, stds):
        if v is None or m is None or s is None or s == 0:
            zscore.append(None)
        else:
            zscore.append((v - m) / s)
    diffs: List[Optional[float]] = [None]
    for i in range(1, len(zscore)):
        a, b = zscore[i - 1], zscore[i]
        diffs.append(None if a is None or b is None else b - a)
    out: List[Optional[float]] = [None] * len(diffs)
    for i in range(len(diffs)):
        if i + 1 < period:
            continue
        chunk = diffs[i + 1 - period : i + 1]
        if any(v is None for v in chunk):
            continue
        out[i] = sum(float(v) for v in chunk)  # type: ignore[arg-type]
    return out


def compute(payload: dict[str, Any]) -> dict[str, Any]:
    params = payload.get("params") if isinstance(payload.get("params"), dict) else {}
    period = int(params.get("period") or 60)
    fast = int(params.get("fast") or 12)
    slow = int(params.get("slow") or 26)
    signal_n = int(params.get("signal") or 9)
    symbol = params.get("symbol")
    bars_raw = payload.get("bars")
    if not isinstance(bars_raw, list) or not bars_raw:
        raise ValueError("input.bars 须为非空")
    rows = [b for b in bars_raw if isinstance(b, dict)]
    if symbol:
        f = [b for b in rows if str(b.get("symbol", "")) == str(symbol)]
        if f:
            rows = f
    # pick densest symbol
    from collections import Counter
    c = Counter(str(b.get("symbol", "")) for b in rows)
    top = c.most_common(1)[0][0] if c else ""
    bars = sorted([b for b in rows if str(b.get("symbol", "")) == top], key=lambda b: str(b.get("date", "")))
    need = period + slow + signal_n + 2
    if len(bars) < need:
        return {
            "ok": False, "skill": SKILL, "signal": [], "series": {}, "metrics": {},
            "assumptions": [], "errors": [f"bars 不足：建议至少 {need}"], "meta": {},
        }
    dates = [str(b.get("date", "")) for b in bars]
    volume = [float(b.get("volume") or 0.0) for b in bars]
    mtm = calc_vmacd_mtm(volume, period=period, fast=fast, slow=slow, signal=signal_n)
    signal = []
    for d, v in zip(dates, mtm):
        if v is None:
            continue
        signal.append({"date": d, "symbol": top, "value": 1.0 if v > 0 else (-1.0 if v < 0 else 0.0), "vmacd_mtm": round(v, 8)})
    return {
        "ok": True,
        "skill": SKILL,
        "signal": signal,
        "series": {"vmacd_mtm": [{"date": d, "value": v} for d, v in zip(dates, mtm) if v is not None]},
        "metrics": {
            "bars": len(bars), "symbol": top, "period": period,
            "last_vmacd_mtm": signal[-1]["vmacd_mtm"] if signal else None,
            "last_signal": signal[-1]["value"] if signal else None,
        },
        "assumptions": [
            "VMACD_MTM：volume MACD hist → zscore → diff → rolling sum（东北证券口径）。",
            "纯 Python EMA/MACD，无 talib；与 vmacd-mtm-timing 配套。",
            "signal-utils-shared 已并入，不单独交付。",
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
