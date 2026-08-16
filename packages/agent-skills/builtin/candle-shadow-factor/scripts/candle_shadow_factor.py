#!/usr/bin/env python3
"""上下影线因子（蜡烛/威廉）。输出 factor series。纯 stdlib。"""
from __future__ import annotations

import argparse
import json
import math
import sys
from typing import Any


def _mean(xs: list[float]) -> float:
    return sum(xs) / len(xs) if xs else float("nan")


def _std(xs: list[float]) -> float:
    if len(xs) < 2:
        return 0.0
    m = _mean(xs)
    return math.sqrt(sum((x - m) ** 2 for x in xs) / len(xs))


def _load_bars(payload: dict[str, Any]) -> list[dict[str, Any]]:
    bars = payload.get("bars")
    if not isinstance(bars, list) or not bars:
        raise ValueError("input.bars 须为非空数组")
    cleaned: list[dict[str, Any]] = []
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
        if not all(math.isfinite(x) for x in (o, h, l, c)):
            continue
        if h < max(o, c) or l > min(o, c):
            # 轻微脏数据：夹紧
            h = max(h, o, c)
            l = min(l, o, c)
        cleaned.append(
            {
                "date": str(b.get("date") or ""),
                "symbol": str(b.get("symbol") or ""),
                "open": o,
                "high": h,
                "low": l,
                "close": c,
            }
        )
    if len(cleaned) < 6:
        raise ValueError("有效 OHLCV bars 不足（至少 6）")
    cleaned.sort(key=lambda r: (r["symbol"], r["date"]))
    return cleaned


def _norm_by_trail_mean(raw: list[float | None], lookback: int) -> list[float | None]:
    out: list[float | None] = [None] * len(raw)
    for i in range(len(raw)):
        if raw[i] is None:
            continue
        # 过去 lookback 日均值（不含当日），与东吴研报一致
        start = i - lookback
        if start < 0:
            continue
        hist = [v for v in raw[start:i] if v is not None and v > 0]
        if not hist:
            continue
        m = _mean(hist)
        if m <= 0:
            continue
        out[i] = raw[i] / m
    return out


def _rolling_stat(vals: list[float | None], window: int, kind: str) -> list[float | None]:
    out: list[float | None] = [None] * len(vals)
    for i in range(len(vals)):
        if i + 1 < window:
            continue
        chunk = [v for v in vals[i + 1 - window : i + 1] if v is not None and math.isfinite(v)]
        if len(chunk) < max(2, window // 2):
            continue
        out[i] = _mean(chunk) if kind == "mean" else _std(chunk)
    return out


def compute(payload: dict[str, Any]) -> dict[str, Any]:
    params = payload.get("params") if isinstance(payload.get("params"), dict) else {}
    mode = str(params.get("mode") or "williams").lower()  # candle | williams
    norm_lb = int(params.get("norm_lookback") or 5)
    agg_lb = int(params.get("agg_lookback") or 20)
    if norm_lb < 1 or agg_lb < 2:
        raise ValueError("norm_lookback/agg_lookback 非法")

    bars = _load_bars(payload)
    # 单标的时序为主；多标的时按 symbol 分组后拼接（附带 symbol 字段）
    by_sym: dict[str, list[dict[str, Any]]] = {}
    for b in bars:
        by_sym.setdefault(b["symbol"] or "_", []).append(b)

    factor_series: list[dict[str, Any]] = []
    upper_series: list[dict[str, Any]] = []
    lower_series: list[dict[str, Any]] = []
    signal: list[dict[str, Any]] = []

    for sym, rows in by_sym.items():
        upper_raw: list[float | None] = []
        lower_raw: list[float | None] = []
        dates = [r["date"] for r in rows]
        for r in rows:
            if mode == "candle":
                u = r["high"] - max(r["open"], r["close"])
                d = min(r["open"], r["close"]) - r["low"]
            else:
                u = r["high"] - r["close"]
                d = r["close"] - r["low"]
            upper_raw.append(max(0.0, u))
            lower_raw.append(max(0.0, d))

        u_n = _norm_by_trail_mean(upper_raw, norm_lb)
        l_n = _norm_by_trail_mean(lower_raw, norm_lb)
        u_mean = _rolling_stat(u_n, agg_lb, "mean")
        u_std = _rolling_stat(u_n, agg_lb, "std")
        l_mean = _rolling_stat(l_n, agg_lb, "mean")
        l_std = _rolling_stat(l_n, agg_lb, "std")

        # 综合因子近似 UBL 思路（无市值中性）：上影 std + 下影 mean（威廉）
        for i, d in enumerate(dates):
            um, us, lm, ls = u_mean[i], u_std[i], l_mean[i], l_std[i]
            if us is None or lm is None:
                continue
            ubl = us + lm
            point = {"date": d, "symbol": sym, "value": round(ubl, 8)}
            factor_series.append(point)
            upper_series.append({"date": d, "symbol": sym, "upper_std": round(us, 8), "upper_mean": None if um is None else round(um, 8)})
            lower_series.append({"date": d, "symbol": sym, "lower_mean": round(lm, 8), "lower_std": None if ls is None else round(ls, 8)})
            # 因子偏低 → 历史研报中多空组合偏强一侧；此处仅输出状态档，不作荐股
            signal.append({"date": d, "symbol": sym, "value": round(ubl, 8)})

    last = factor_series[-1]["value"] if factor_series else None
    return {
        "ok": True,
        "skill": "candle-shadow-factor",
        "signal": signal,
        "series": {
            "factor": factor_series,
            "upper": upper_series,
            "lower": lower_series,
        },
        "metrics": {
            "bars": len(bars),
            "symbols": len(by_sym),
            "mode": mode,
            "norm_lookback": norm_lb,
            "agg_lookback": agg_lb,
            "last_factor": last,
            "factor_points": len(factor_series),
        },
        "assumptions": [
            "溯源东吴「上下影线」：标准化影线 / 近5日均值，再对近20日取 mean/std。",
            "综合 factor ≈ Upper_shadow_std + Williams_lower_shadow_mean（无市值中性，截面时须另声明）。",
            f"mode={mode}（candle=开收基准；williams=收盘基准）。",
            "输出为因子序列事实，禁止据此荐股。",
        ],
        "errors": [],
    }


def main() -> int:
    ap = argparse.ArgumentParser(description="Candle shadow factor")
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
        err = {"ok": False, "skill": "candle-shadow-factor", "signal": [], "series": {}, "metrics": {}, "assumptions": [], "errors": [str(e)]}
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
