#!/usr/bin/env python3
"""中金 QRS 择时：corr/beta/zscore/regulation。纯 stdlib，单标的 high/low。"""
from __future__ import annotations

import argparse
import json
import math
import sys
from typing import Any


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
    if den <= 0:
        return float("nan")
    return num / den


def _beta(low: list[float], high: list[float]) -> float:
    c = _corr(low, high)
    sd_l, sd_h = _std(low), _std(high)
    if not math.isfinite(c) or sd_l <= 0:
        return float("nan")
    return (sd_h / sd_l) * c


def _zscore_last(window: list[float]) -> float:
    finite = [v for v in window if math.isfinite(v)]
    if len(finite) < 2:
        return float("nan")
    m = _mean(finite)
    sd = _std(finite)
    if sd <= 0:
        return float("nan")
    return (finite[-1] - m) / sd


def _load_bars(payload: dict[str, Any]) -> list[dict[str, Any]]:
    bars = payload.get("bars")
    if not isinstance(bars, list) or not bars:
        raise ValueError("input.bars 须为非空数组")
    cleaned: list[dict[str, Any]] = []
    for b in bars:
        if not isinstance(b, dict):
            continue
        try:
            high = float(b["high"])
            low = float(b["low"])
        except (KeyError, TypeError, ValueError):
            continue
        if not math.isfinite(high) or not math.isfinite(low):
            continue
        cleaned.append({"date": str(b.get("date") or ""), "high": high, "low": low})
    if len(cleaned) < 5:
        raise ValueError("有效 high/low bars 不足")
    cleaned.sort(key=lambda r: r["date"])
    return cleaned


def compute(payload: dict[str, Any]) -> dict[str, Any]:
    params = payload.get("params") if isinstance(payload.get("params"), dict) else {}
    n = int(params.get("N") or params.get("regression_window") or 18)
    m = int(params.get("M") or params.get("zscore_window") or 40)
    power = int(params.get("n") or params.get("regulation_power") or 2)
    adjust = bool(params.get("adjust_regulation") or False)
    use_simple = bool(params.get("use_simple_beta") or False)
    buy_th = float(params.get("buy_threshold") or 0.5)
    sell_th = float(params.get("sell_threshold") or -0.5)
    if n < 3 or m < 3:
        raise ValueError("N/M 须 >= 3")

    bars = _load_bars(payload)
    lows = [b["low"] for b in bars]
    highs = [b["high"] for b in bars]
    dates = [b["date"] for b in bars]

    beta_list: list[float | None] = [None] * len(bars)
    corr_list: list[float | None] = [None] * len(bars)
    reg_list: list[float | None] = [None] * len(bars)

    for i in range(n - 1, len(bars)):
        lo = lows[i + 1 - n : i + 1]
        hi = highs[i + 1 - n : i + 1]
        c = _corr(lo, hi)
        if use_simple:
            sd_l, sd_h = _std(lo), _std(hi)
            b = (sd_h / sd_l) if sd_l > 0 else float("nan")
        else:
            b = _beta(lo, hi)
        if math.isfinite(b):
            beta_list[i] = b
        if math.isfinite(c):
            corr_list[i] = c
            reg_list[i] = abs(c) ** power  # corr^n；|corr| 保证非负钝化

    if adjust:
        # 惩罚项 / 滚动均值
        adj: list[float | None] = [None] * len(reg_list)
        for i in range(len(reg_list)):
            if reg_list[i] is None:
                continue
            start = max(0, i + 1 - n)
            chunk = [v for v in reg_list[start : i + 1] if v is not None]
            if not chunk:
                continue
            mean_r = _mean(chunk)
            adj[i] = (reg_list[i] / mean_r) if mean_r > 0 else reg_list[i]
        reg_list = adj

    z_beta: list[float | None] = [None] * len(bars)
    qrs: list[float | None] = [None] * len(bars)
    for i in range(len(bars)):
        if i + 1 < m:
            continue
        window = [v for v in beta_list[i + 1 - m : i + 1] if v is not None]
        if len(window) < max(2, m // 2):
            continue
        z = _zscore_last(window)
        if not math.isfinite(z):
            continue
        z_beta[i] = z
        r = reg_list[i]
        if r is None or not math.isfinite(r):
            continue
        qrs[i] = z * r

    signal: list[dict[str, Any]] = []
    state = 0
    for i, v in enumerate(qrs):
        if v is None or not math.isfinite(v):
            continue
        if v >= buy_th:
            state = 1
        elif v <= sell_th:
            state = -1
        signal.append({"date": dates[i], "value": state, "qrs": round(v, 6)})

    def pts(vals: list[float | None]) -> list[dict[str, Any]]:
        return [
            {"date": dates[i], "value": round(v, 8)}
            for i, v in enumerate(vals)
            if v is not None and math.isfinite(v)
        ]

    return {
        "ok": True,
        "skill": "qrs-timing",
        "signal": signal,
        "series": {
            "beta": pts(beta_list),
            "corr": pts(corr_list),
            "regulation": pts(reg_list),
            "zscore_beta": pts(z_beta),
            "qrs": pts(qrs),
        },
        "metrics": {
            "bars": len(bars),
            "N": n,
            "M": m,
            "regulation_power": power,
            "use_simple_beta": use_simple,
            "adjust_regulation": adjust,
            "last_qrs": signal[-1]["qrs"] if signal else None,
            "last_signal": signal[-1]["value"] if signal else None,
            "signal_points": len(signal),
        },
        "assumptions": [
            "方法溯源中金《技术择时艺术》QRS：窗口内 high/low 的 corr、β、β 的滚动 zscore，再乘 regulation=|corr|^n。",
            f"参数 N={n}, M={m}, n={power}；fixture 常用缩短 M。",
            "脚本仅 stdlib；未引入 numpy/pandas。",
            "信号为规则状态，非买卖建议。",
        ],
        "errors": [],
    }


def main() -> int:
    ap = argparse.ArgumentParser(description="QRS timing")
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
        err = {"ok": False, "skill": "qrs-timing", "signal": [], "series": {}, "metrics": {}, "assumptions": [], "errors": [str(e)]}
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
