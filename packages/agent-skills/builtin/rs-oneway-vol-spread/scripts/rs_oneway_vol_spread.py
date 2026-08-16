#!/usr/bin/env python3
"""相对强弱单向波动差（国信）：上行−下行波动剪刀差 + 可选 RPS 加权。纯 stdlib。"""
from __future__ import annotations

import argparse
import json
import math
import sys
from typing import Any


def _mean(xs: list[float]) -> float:
    return sum(xs) / len(xs) if xs else float("nan")


def _sma(vals: list[float | None], n: int) -> list[float | None]:
    out: list[float | None] = [None] * len(vals)
    for i in range(len(vals)):
        if i + 1 < n:
            continue
        chunk = vals[i + 1 - n : i + 1]
        finite = [v for v in chunk if v is not None and math.isfinite(v)]
        if len(finite) < max(1, n // 2):
            continue
        out[i] = sum(finite) / len(finite)
    return out


def _load_bars(payload: dict[str, Any]) -> list[dict[str, Any]]:
    bars = payload.get("bars")
    if not isinstance(bars, list) or not bars:
        raise ValueError("input.bars 须为非空 OHLC 数组")
    out: list[dict[str, Any]] = []
    for b in bars:
        if not isinstance(b, dict):
            continue
        try:
            o = float(b["open"])
            h = float(b["high"])
            l = float(b["low"])
            c = float(b["close"])
        except (KeyError, TypeError, ValueError):
            continue
        if not all(math.isfinite(x) for x in (o, h, l, c)) or min(o, h, l, c) <= 0:
            continue
        out.append(
            {
                "date": str(b.get("date") or ""),
                "symbol": str(b.get("symbol") or ""),
                "open": o,
                "high": h,
                "low": l,
                "close": c,
            }
        )
    if len(out) < 30:
        raise ValueError("有效 bars 不足（建议 >= 60）")
    # 若多标的，默认取条数最多者（指数/主标的）；也可 params.symbol 指定
    return out


def _pick_series(bars: list[dict[str, Any]], symbol: str | None) -> list[dict[str, Any]]:
    by: dict[str, list[dict[str, Any]]] = {}
    for b in bars:
        by.setdefault(b["symbol"] or "_", []).append(b)
    if symbol:
        if symbol not in by:
            raise ValueError(f"找不到 symbol={symbol}")
        rows = by[symbol]
    else:
        rows = max(by.values(), key=len)
    rows = sorted(rows, key=lambda r: r["date"])
    return rows


def _rps(closes: list[float], lookback: int = 250) -> list[float | None]:
    """价格在滚动高低区间的相对位置。"""
    out: list[float | None] = [None] * len(closes)
    for i in range(len(closes)):
        start = max(0, i + 1 - lookback)
        window = closes[start : i + 1]
        lo, hi = min(window), max(window)
        if hi <= lo:
            out[i] = 0.5
        else:
            out[i] = (closes[i] - lo) / (hi - lo)
    return out


def compute(payload: dict[str, Any]) -> dict[str, Any]:
    params = payload.get("params") if isinstance(payload.get("params"), dict) else {}
    ma_n = int(params.get("ma") or params.get("diff_ma") or 60)
    rps_smooth = int(params.get("rps_ma") or 10)
    rps_lookback = int(params.get("rps_lookback") or 250)
    use_rps = bool(params.get("use_rps") or False)
    symbol = params.get("symbol")
    symbol_s = str(symbol).strip() if symbol else None

    bars = _load_bars(payload)
    rows = _pick_series(bars, symbol_s)
    dates = [r["date"] for r in rows]
    opens = [r["open"] for r in rows]
    highs = [r["high"] for r in rows]
    lows = [r["low"] for r in rows]
    closes = [r["close"] for r in rows]

    # 国信：上行波动 = high/open-1；下行 = 1-low/open；差 = 上行-下行
    up: list[float | None] = []
    down: list[float | None] = []
    diff: list[float | None] = []
    rets: list[float | None] = [None]
    for i in range(len(rows)):
        o, h, l = opens[i], highs[i], lows[i]
        u = h / o - 1.0
        d = 1.0 - l / o
        up.append(u if math.isfinite(u) else None)
        down.append(d if math.isfinite(d) else None)
        if math.isfinite(u) and math.isfinite(d):
            diff.append(u - d)
        else:
            diff.append(None)
        if i > 0 and closes[i - 1] > 0:
            r = closes[i] / closes[i - 1] - 1.0
            rets.append(r if math.isfinite(r) else None)
        elif i > 0:
            rets.append(None)

    diff_ma = _sma(diff, ma_n)

    rps_raw = _rps(closes, rps_lookback)
    rps_ma = _sma(rps_raw, rps_smooth)

    # RPS 加权单向差：上涨日用 +RPS，下跌日用 -RPS，再平滑（研报 Sensitivity_analysis）
    rps_signed: list[float | None] = [None] * len(rows)
    for i in range(len(rows)):
        rp = rps_ma[i]
        ret = rets[i] if i < len(rets) else None
        if rp is None or ret is None:
            continue
        rps_signed[i] = rp if ret > 0 else (-rp if ret <= 0 else 0.0)
    rps_diff_ma = _sma(rps_signed, rps_smooth)

    signal: list[dict[str, Any]] = []
    state = 0
    for i in range(len(rows)):
        if use_rps:
            x = rps_diff_ma[i]
        else:
            x = diff_ma[i]
        if x is None or not math.isfinite(x):
            continue
        state = 1 if x > 0 else 0
        signal.append(
            {
                "date": dates[i],
                "value": state,
                "diff_ma": round(x, 8),
            }
        )

    def pts(vals: list[float | None]) -> list[dict[str, Any]]:
        return [
            {"date": dates[i], "value": round(v, 8)}
            for i, v in enumerate(vals)
            if v is not None and math.isfinite(v)
        ]

    last = signal[-1] if signal else None
    assumptions = [
        "方法溯源国信证券：相对强弱框架下的单向波动差（振幅剪刀差）。",
        "上行=high/open−1，下行=1−low/open；差的移动平均>0 → 偏多状态。",
        f"默认 ma={ma_n}；use_rps={use_rps} 时改用 RPS 符号加权差（平滑 {rps_smooth}）。",
        "信号为规则状态，非买卖指令。",
    ]
    return {
        "ok": True,
        "skill": "rs-oneway-vol-spread",
        "signal": signal,
        "series": {
            "up_vol": pts(up),
            "down_vol": pts(down),
            "diff": pts(diff),
            "diff_ma": pts(diff_ma),
            "rps": pts(rps_ma),
            "rps_diff_ma": pts(rps_diff_ma),
        },
        "metrics": {
            "ma": ma_n,
            "use_rps": use_rps,
            "bars": len(rows),
            "symbol": rows[0]["symbol"] if rows else None,
            "last_signal": last["value"] if last else None,
            "last_diff_ma": last["diff_ma"] if last else None,
        },
        "assumptions": assumptions,
        "errors": [],
    }


def main() -> int:
    ap = argparse.ArgumentParser(description="RS one-way vol spread")
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
            "skill": "rs-oneway-vol-spread",
            "signal": [],
            "series": {},
            "metrics": {},
            "assumptions": [],
            "errors": [str(e)],
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
