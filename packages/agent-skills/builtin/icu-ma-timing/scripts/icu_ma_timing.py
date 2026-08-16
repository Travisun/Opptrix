#!/usr/bin/env python3
"""ICU 均线择时：重复中位数（Siegel）稳健回归外推均线 + 收盘穿越信号。纯 stdlib。"""
from __future__ import annotations

import argparse
import json
import math
import sys
from typing import Any


def _median(xs: list[float]) -> float:
    ys = sorted(xs)
    n = len(ys)
    if n == 0:
        return float("nan")
    mid = n // 2
    if n % 2:
        return ys[mid]
    return 0.5 * (ys[mid - 1] + ys[mid])


def siegelslope_endpoint(prices: list[float]) -> float:
    """Siegel 1982 repeated median：返回窗口末端拟合值 intercept + slope*(n-1)。"""
    n = len(prices)
    if n < 2:
        return float("nan")
    xs = list(range(n))
    slopes_i: list[float] = []
    for i in range(n):
        pair_slopes: list[float] = []
        for j in range(n):
            if i == j:
                continue
            dx = xs[j] - xs[i]
            if dx == 0:
                continue
            pair_slopes.append((prices[j] - prices[i]) / dx)
        if pair_slopes:
            slopes_i.append(_median(pair_slopes))
    if not slopes_i:
        return float("nan")
    slope = _median(slopes_i)
    intercepts: list[float] = [prices[i] - slope * xs[i] for i in range(n)]
    intercept = _median(intercepts)
    return intercept + slope * (n - 1)


def _load_bars(payload: dict[str, Any]) -> list[dict[str, Any]]:
    bars = payload.get("bars")
    if not isinstance(bars, list) or not bars:
        raise ValueError("input.bars 须为非空数组")
    cleaned: list[dict[str, Any]] = []
    for b in bars:
        if not isinstance(b, dict):
            continue
        try:
            close = float(b["close"])
        except (KeyError, TypeError, ValueError):
            continue
        if not math.isfinite(close) or close <= 0:
            continue
        cleaned.append({"date": str(b.get("date") or ""), "close": close})
    if len(cleaned) < 5:
        raise ValueError("有效 close bars 不足")
    cleaned.sort(key=lambda r: r["date"])
    return cleaned


def compute(payload: dict[str, Any]) -> dict[str, Any]:
    params = payload.get("params") if isinstance(payload.get("params"), dict) else {}
    n = int(params.get("N") or params.get("window") or 5)
    if n < 3:
        raise ValueError("N 须 >= 3")

    bars = _load_bars(payload)
    if len(bars) <= n:
        raise ValueError("price length must be greater than N")
    closes = [b["close"] for b in bars]
    dates = [b["date"] for b in bars]

    icu: list[float | None] = [None] * len(bars)
    for i in range(n - 1, len(bars)):
        window = closes[i + 1 - n : i + 1]
        val = siegelslope_endpoint(window)
        if math.isfinite(val):
            icu[i] = val

    # 收盘上穿 ICU → 1；下穿 → -1；沿用持仓状态
    signal: list[dict[str, Any]] = []
    state = 0
    prev_diff: float | None = None
    for i in range(len(bars)):
        if icu[i] is None:
            continue
        diff = closes[i] - icu[i]  # type: ignore[operator]
        if prev_diff is not None:
            if prev_diff <= 0 < diff:
                state = 1
            elif prev_diff >= 0 > diff:
                state = -1
        signal.append(
            {
                "date": dates[i],
                "value": state,
                "close": round(closes[i], 6),
                "icu_ma": round(icu[i], 6),  # type: ignore[arg-type]
            }
        )
        prev_diff = diff

    series_icu = [
        {"date": dates[i], "value": round(v, 8)}
        for i, v in enumerate(icu)
        if v is not None and math.isfinite(v)
    ]
    series_close = [{"date": dates[i], "value": round(closes[i], 8)} for i in range(len(bars))]

    return {
        "ok": True,
        "skill": "icu-ma-timing",
        "signal": signal,
        "series": {"close": series_close, "icu_ma": series_icu},
        "metrics": {
            "bars": len(bars),
            "N": n,
            "last_icu_ma": series_icu[-1]["value"] if series_icu else None,
            "last_close": closes[-1],
            "last_signal": signal[-1]["value"] if signal else None,
            "signal_points": len(signal),
        },
        "assumptions": [
            "ICU 均线 = 窗口内 Siegel 重复中位数稳健回归在末端的拟合值（intercept+slope*(N-1)）。",
            "信号规则：收盘上穿 ICU→1、下穿→-1（对照原 backtrader CrossOver 思路）。",
            "纯 Python 实现，无 scipy；大窗口时计算量 O(N²×T)，N 宜保持较小。",
            "信号为规则状态，非买卖建议。",
        ],
        "errors": [],
    }


def main() -> int:
    ap = argparse.ArgumentParser(description="ICU MA timing")
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
        err = {"ok": False, "skill": "icu-ma-timing", "signal": [], "series": {}, "metrics": {}, "assumptions": [], "errors": [str(e)]}
        print(json.dumps(err, ensure_ascii=False), file=sys.stderr)
        if args.output:
            with open(args.output, "w", encoding="utf-8") as f:
                json.dump(err, f, ensure_ascii=False, indent=2)
        return 1
    text = json.dumps(result, ensure_ascii=False, indent=2)
    if args.output:
        with open(args.output, "w", encoding="utf-8") as f:
            f.write(text + "\n")
    print(text)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
