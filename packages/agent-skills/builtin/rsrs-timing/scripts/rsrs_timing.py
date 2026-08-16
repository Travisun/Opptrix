#!/usr/bin/env python3
"""光大 RSRS 择时：high~low OLS → β、R² → rsrs=β*R² → 滚动 zscore。纯 stdlib。"""
from __future__ import annotations

import argparse
import json
import math
import sys
from typing import Any


def _mean(xs: list[float]) -> float:
    return sum(xs) / len(xs) if xs else float("nan")


def _ols_beta_r2(xs: list[float], ys: list[float]) -> tuple[float, float]:
    n = len(xs)
    if n < 2:
        return float("nan"), float("nan")
    mx, my = _mean(xs), _mean(ys)
    sxx = sum((x - mx) ** 2 for x in xs)
    if sxx <= 0:
        return float("nan"), float("nan")
    sxy = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    beta = sxy / sxx
    intercept = my - beta * mx
    ss_tot = sum((y - my) ** 2 for y in ys)
    if ss_tot <= 0:
        return beta, float("nan")
    ss_res = sum((y - (intercept + beta * x)) ** 2 for x, y in zip(xs, ys))
    r2 = 1.0 - ss_res / ss_tot
    return beta, max(0.0, min(1.0, r2))


def _rolling_zscore(values: list[float | None], window: int) -> list[float | None]:
    out: list[float | None] = [None] * len(values)
    for i in range(len(values)):
        if i + 1 < window:
            continue
        chunk = values[i + 1 - window : i + 1]
        finite = [v for v in chunk if v is not None and math.isfinite(v)]
        if len(finite) < max(2, window // 2):
            continue
        m = _mean(finite)
        var = sum((v - m) ** 2 for v in finite) / len(finite)
        sd = math.sqrt(var) if var > 0 else 0.0
        cur = values[i]
        if cur is None or not math.isfinite(cur) or sd <= 0:
            continue
        out[i] = (cur - m) / sd
    return out


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
        cleaned.append(
            {
                "date": str(b.get("date") or ""),
                "symbol": str(b.get("symbol") or ""),
                "high": high,
                "low": low,
            }
        )
    if len(cleaned) < 3:
        raise ValueError("有效 high/low bars 不足")
    cleaned.sort(key=lambda r: r["date"])
    return cleaned


def compute(payload: dict[str, Any]) -> dict[str, Any]:
    params = payload.get("params") if isinstance(payload.get("params"), dict) else {}
    n = int(params.get("N") or params.get("regression_window") or 18)
    m = int(params.get("M") or params.get("zscore_window") or 60)
    buy_th = float(params.get("buy_threshold") or 0.7)
    sell_th = float(params.get("sell_threshold") or -0.7)
    if n < 3 or m < 3:
        raise ValueError("N/M 须 >= 3")

    bars = _load_bars(payload)
    highs = [b["high"] for b in bars]
    lows = [b["low"] for b in bars]
    dates = [b["date"] for b in bars]

    beta_s: list[float | None] = [None] * len(bars)
    r2_s: list[float | None] = [None] * len(bars)
    rsrs_s: list[float | None] = [None] * len(bars)

    for i in range(n - 1, len(bars)):
        xs = lows[i + 1 - n : i + 1]
        ys = highs[i + 1 - n : i + 1]
        beta, r2 = _ols_beta_r2(xs, ys)
        if not math.isfinite(beta) or not math.isfinite(r2):
            continue
        beta_s[i] = beta
        r2_s[i] = r2
        rsrs_s[i] = beta * r2

    z_s = _rolling_zscore(rsrs_s, m)

    signal: list[dict[str, Any]] = []
    state = 0
    for i, z in enumerate(z_s):
        if z is None or not math.isfinite(z):
            continue
        if z >= buy_th:
            state = 1
        elif z <= sell_th:
            state = -1
        signal.append({"date": dates[i], "value": state, "rsrs_z": round(z, 6)})

    def series_points(vals: list[float | None]) -> list[dict[str, Any]]:
        return [
            {"date": dates[i], "value": round(v, 8)}
            for i, v in enumerate(vals)
            if v is not None and math.isfinite(v)
        ]

    last_z = next((s["rsrs_z"] for s in reversed(signal)), None)
    last_state = signal[-1]["value"] if signal else None
    assumptions = [
        "方法溯源光大证券 RSRS：窗口内 high 对 low OLS，rsrs=β×R²，再对 rsrs 滚动 zscore。",
        f"默认参数 N={n}, M={m}, 买入阈值={buy_th}, 卖出阈值={sell_th}（fixture 常用缩短 M）。",
        "信号为规则状态（1 风险偏好偏多 / -1 偏空 / 0 未触发），非买卖指令。",
    ]
    return {
        "ok": True,
        "skill": "rsrs-timing",
        "signal": signal,
        "series": {
            "beta": series_points(beta_s),
            "r2": series_points(r2_s),
            "rsrs": series_points(rsrs_s),
            "rsrs_z": series_points(z_s),
        },
        "metrics": {
            "bars": len(bars),
            "N": n,
            "M": m,
            "buy_threshold": buy_th,
            "sell_threshold": sell_th,
            "last_rsrs_z": last_z,
            "last_signal": last_state,
            "signal_points": len(signal),
        },
        "assumptions": assumptions,
        "errors": [],
    }


def main() -> int:
    ap = argparse.ArgumentParser(description="RSRS timing")
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
        err = {"ok": False, "skill": "rsrs-timing", "signal": [], "series": {}, "metrics": {}, "assumptions": [], "errors": [str(e)]}
        print(json.dumps(err, ensure_ascii=False), file=sys.stderr)
        if args.output:
            with open(args.output, "w", encoding="utf-8") as f:
                json.dump(err, f, ensure_ascii=False, indent=2)
        return 1
    text = json.dumps(result, ensure_ascii=False, indent=2)
    if args.output:
        with open(args.output, "w", encoding="utf-8") as f:
            f.write(text)
            f.write("\n")
    print(text)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
