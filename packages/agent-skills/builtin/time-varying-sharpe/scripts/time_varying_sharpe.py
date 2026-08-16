#!/usr/bin/env python3
"""滚动时变夏普择时。纯 stdlib。"""
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
    return math.sqrt(sum((x - m) ** 2 for x in xs) / (len(xs) - 1))


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
    window = int(params.get("window") or params.get("N") or 60)
    rf_daily = float(params.get("rf_daily") or 0.0)
    ann = float(params.get("ann_factor") or math.sqrt(252.0))
    buy_th = float(params.get("buy_threshold") or 0.5)
    sell_th = float(params.get("sell_threshold") or 0.0)
    if window < 5:
        raise ValueError("window 须 >= 5")

    bars = _load_bars(payload)
    closes = [b["close"] for b in bars]
    dates = [b["date"] for b in bars]
    rets: list[float | None] = [None]
    for i in range(1, len(closes)):
        rets.append(closes[i] / closes[i - 1] - 1.0)

    tv_sharpe: list[float | None] = [None] * len(bars)
    for i in range(len(bars)):
        if i + 1 < window + 1:
            continue
        chunk = [r - rf_daily for r in rets[i + 1 - window : i + 1] if r is not None]
        if len(chunk) < window // 2:
            continue
        sd = _std(chunk)
        if sd <= 0:
            continue
        tv_sharpe[i] = (_mean(chunk) / sd) * ann

    signal: list[dict[str, Any]] = []
    state = 0
    for i, s in enumerate(tv_sharpe):
        if s is None or not math.isfinite(s):
            continue
        if s >= buy_th:
            state = 1
        elif s <= sell_th:
            state = 0
        signal.append({"date": dates[i], "value": state, "tv_sharpe": round(s, 6)})

    series_tv = [
        {"date": dates[i], "value": round(v, 8)}
        for i, v in enumerate(tv_sharpe)
        if v is not None and math.isfinite(v)
    ]
    series_ret = [
        {"date": dates[i], "value": round(v, 8)}
        for i, v in enumerate(rets)
        if v is not None and math.isfinite(v)
    ]

    return {
        "ok": True,
        "skill": "time-varying-sharpe",
        "signal": signal,
        "series": {"returns": series_ret, "tv_sharpe": series_tv},
        "metrics": {
            "bars": len(bars),
            "window": window,
            "rf_daily": rf_daily,
            "ann_factor": ann,
            "last_tv_sharpe": signal[-1]["tv_sharpe"] if signal else None,
            "last_signal": signal[-1]["value"] if signal else None,
            "signal_points": len(signal),
        },
        "assumptions": [
            "本实现为滚动样本夏普（超额收益均值/标准差×√252），作择时状态；非 Whitelaw 两步回归完整复现。",
            "若需国海/国信研报中的宏观因子回归版时变夏普，须另供预测变量面板并声明假设。",
            f"window={window}；signal=1 表示滚动夏普偏强，0 表示偏弱（非买卖指令）。",
        ],
        "errors": [],
    }


def main() -> int:
    ap = argparse.ArgumentParser(description="Time-varying Sharpe timing")
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
        err = {"ok": False, "skill": "time-varying-sharpe", "signal": [], "series": {}, "metrics": {}, "assumptions": [], "errors": [str(e)]}
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
