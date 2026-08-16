#!/usr/bin/env python3
"""择时视角下的波动率因子（纯 stdlib）。

基础：过去 N 日收益标准差；对其做均线交叉 / zscore 得到择时状态。
若 panels 提供截面分位计数，可构造数量剪刀差信号；否则走指数单序列路径。
"""
from __future__ import annotations

import argparse
import json
import math
import sys
from typing import Any

SKILL = "vol-factor-timing"



def _data_meta(data_mode: str, used: list[str], missing: list[str] | None = None, **extra: Any) -> dict[str, Any]:
    mode = data_mode if data_mode in ("full", "proxy", "insufficient") else "proxy"
    out: dict[str, Any] = {
        "data_mode": mode,
        "degraded": mode == "proxy",
        "used_inputs": list(used),
        "missing_for_full": list(missing or []),
    }
    out.update(extra)
    return out

def _sma(xs: list[float | None], n: int) -> list[float | None]:
    out: list[float | None] = [None] * len(xs)
    for i in range(len(xs)):
        if i + 1 < n:
            continue
        chunk = xs[i + 1 - n : i + 1]
        if any(v is None for v in chunk):
            continue
        out[i] = sum(float(v) for v in chunk) / n  # type: ignore[arg-type]
    return out


def _pick(payload: dict[str, Any]) -> list[dict[str, Any]]:
    bars = payload.get("bars")
    if not isinstance(bars, list) or not bars:
        raise ValueError("input.bars 须为非空")
    params = payload.get("params") if isinstance(payload.get("params"), dict) else {}
    symbol = params.get("symbol")
    rows = [b for b in bars if isinstance(b, dict)]
    if symbol:
        f = [b for b in rows if str(b.get("symbol", "")) == str(symbol)]
        if f:
            rows = f
    out = []
    for b in rows:
        try:
            c = float(b["close"])
        except (KeyError, TypeError, ValueError):
            continue
        if c <= 0:
            continue
        out.append({"date": str(b.get("date") or ""), "symbol": str(b.get("symbol") or ""), "close": c})
    if len(out) < 40:
        raise ValueError("有效 bars 不足")
    out.sort(key=lambda r: r["date"])
    return out


def compute(payload: dict[str, Any]) -> dict[str, Any]:
    params = payload.get("params") if isinstance(payload.get("params"), dict) else {}
    n = int(params.get("vol_window") or 21)
    fast = int(params.get("fast") or 10)
    slow = int(params.get("slow") or 30)
    bars = _pick(payload)
    dates = [b["date"] for b in bars]
    close = [b["close"] for b in bars]
    sym = bars[0]["symbol"]

    rets: list[float | None] = [None]
    for i in range(1, len(close)):
        rets.append(close[i] / close[i - 1] - 1.0)

    vol: list[float | None] = [None] * len(close)
    for i in range(len(close)):
        if i + 1 < n:
            continue
        chunk = rets[i + 1 - n : i + 1]
        if any(v is None for v in chunk):
            continue
        xs = [float(v) for v in chunk]  # type: ignore[arg-type]
        m = sum(xs) / n
        var = sum((x - m) ** 2 for x in xs) / max(n - 1, 1)
        vol[i] = math.sqrt(var)

    ma_f = _sma(vol, fast)
    ma_s = _sma(vol, slow)

    panels = payload.get("panels") if isinstance(payload.get("panels"), dict) else {}
    breadth = panels.get("vol_breadth")  # optional [{date, low_count, high_count}]
    degraded = False
    assumptions = [
        "基础波动率因子=过去 N 日收益标准差（默认 21）。",
        "择时：波动率快慢均线 — 快线上穿慢线视为波动升温偏空（-1），下穿偏多（+1）。",
    ]

    signal = []
    if isinstance(breadth, list) and len(breadth) >= 10:
        # diffusion-like scissors on high/low vol group counts
        by = {str(r.get("date")): r for r in breadth if isinstance(r, dict)}
        for i, d in enumerate(dates):
            row = by.get(d)
            if not row or ma_f[i] is None or ma_s[i] is None:
                continue
            try:
                hi = float(row.get("high_count"))
                lo = float(row.get("low_count"))
            except (TypeError, ValueError):
                continue
            scissors = math.log(max(hi, 1.0)) - math.log(max(lo, 1.0))
            # combine: rising vol MA + high-vol crowding → -1
            vol_state = -1.0 if ma_f[i] > ma_s[i] else 1.0  # type: ignore[operator]
            val = vol_state if scissors * vol_state > 0 else 0.0
            signal.append({"date": d, "symbol": sym, "value": val, "scissors": round(scissors, 6)})
        assumptions.append("使用 panels.vol_breadth 数量剪刀差与波动均线共振。")
    else:
        degraded = True
        assumptions.append("无截面波动分组计数：降级为指数已实现波动双均线择时。")
        for i, d in enumerate(dates):
            if ma_f[i] is None or ma_s[i] is None:
                continue
            val = -1.0 if ma_f[i] > ma_s[i] else 1.0  # type: ignore[operator]
            signal.append({"date": d, "symbol": sym, "value": val})

    return {
        "ok": True,
        "skill": SKILL,
        "signal": signal,
        "series": {
            "realized_vol": [{"date": dates[i], "value": v} for i, v in enumerate(vol) if v is not None],
            "vol_ma_fast": [{"date": dates[i], "value": v} for i, v in enumerate(ma_f) if v is not None],
            "vol_ma_slow": [{"date": dates[i], "value": v} for i, v in enumerate(ma_s) if v is not None],
        },
        "metrics": {
            "bars": len(bars),
            "symbol": sym,
            "vol_window": n,
            "fast": fast,
            "slow": slow,
            "last_signal": signal[-1]["value"] if signal else None,
            "last_vol": next((v for v in reversed(vol) if v is not None), None),
        },
        "assumptions": assumptions + ["仅标准库；特异波动/FF3 路径需多因子面板，未在此强依赖。"],
        "errors": [],
        "meta": (
            _data_meta("full", ["bars.daily", "panels.vol_breadth"], [])
            if not degraded else
            _data_meta("proxy", ["bars.daily"], ["panels.vol_breadth"], reason="no_vol_breadth")
        ),
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
