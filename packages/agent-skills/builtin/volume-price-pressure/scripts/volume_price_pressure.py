#!/usr/bin/env python3
"""量价买卖压力因子（APB）：日频 OHLCV 窗口版。纯 stdlib。"""
from __future__ import annotations

import argparse
import json
import math
import sys
from collections import defaultdict
from typing import Any


def _mean(xs: list[float]) -> float:
    return sum(xs) / len(xs) if xs else float("nan")


def _vwap(prices: list[float], volumes: list[float]) -> float | None:
    tw = sum(volumes)
    if tw <= 0:
        return None
    return sum(p * v for p, v in zip(prices, volumes)) / tw


def _load_bars(payload: dict[str, Any]) -> list[dict[str, Any]]:
    bars = payload.get("bars")
    if not isinstance(bars, list) or not bars:
        raise ValueError("input.bars 须为非空 OHLCV 数组")
    out: list[dict[str, Any]] = []
    for b in bars:
        if not isinstance(b, dict):
            continue
        try:
            h = float(b.get("high", b.get("close")))
            l = float(b.get("low", b.get("close")))
            c = float(b["close"])
            v = float(b.get("volume") or 0)
            amt = float(b.get("amount") or 0)
        except (KeyError, TypeError, ValueError):
            continue
        if not all(math.isfinite(x) for x in (h, l, c, v)) or c <= 0:
            continue
        # 日均价：优先成交额/量，否则典型价
        if amt > 0 and v > 0:
            px = amt / v
        else:
            px = (h + l + c) / 3.0
        if not math.isfinite(px) or px <= 0:
            continue
        out.append(
            {
                "date": str(b.get("date") or ""),
                "symbol": str(b.get("symbol") or ""),
                "price": px,
                "volume": max(v, 0.0),
                "close": c,
            }
        )
    if len(out) < 5:
        raise ValueError("有效价量 bars 不足")
    out.sort(key=lambda r: (r["symbol"], r["date"]))
    return out


def _apb_window(prices: list[float], volumes: list[float]) -> float | None:
    """APB = 算术均价 / 成交量加权均价；>1 表示价在量权均价之上。"""
    if len(prices) < 2:
        return None
    m = _mean(prices)
    w = _vwap(prices, volumes)
    if w is None or w <= 0 or not math.isfinite(m):
        return None
    return m / w


def compute(payload: dict[str, Any]) -> dict[str, Any]:
    params = payload.get("params") if isinstance(payload.get("params"), dict) else {}
    window = int(params.get("window") or params.get("N") or 30)
    min_days = int(params.get("min_days") or max(5, window // 2))
    use_log = bool(params.get("log", True))
    if window < 3:
        raise ValueError("window 须 >= 3")

    bars = _load_bars(payload)
    by_sym: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for b in bars:
        by_sym[b["symbol"]].append(b)

    series_rows: list[dict[str, Any]] = []
    latest: list[dict[str, Any]] = []

    for sym, rows in by_sym.items():
        rows = sorted(rows, key=lambda r: r["date"])
        apb_ts: list[float | None] = [None] * len(rows)
        for i in range(len(rows)):
            if i + 1 < window:
                continue
            chunk = rows[i + 1 - window : i + 1]
            # 过滤零成交日
            prices = [r["price"] for r in chunk if r["volume"] > 0]
            vols = [r["volume"] for r in chunk if r["volume"] > 0]
            if len(prices) < min_days:
                continue
            apb = _apb_window(prices, vols)
            if apb is None or apb <= 0:
                continue
            val = math.log(apb) if use_log else apb
            if not math.isfinite(val):
                continue
            apb_ts[i] = val
            series_rows.append(
                {"symbol": sym, "date": rows[i]["date"], "value": round(val, 8), "apb": round(apb, 8)}
            )
        # 最新有效值
        for i in range(len(rows) - 1, -1, -1):
            if apb_ts[i] is not None:
                latest.append(
                    {
                        "symbol": sym,
                        "date": rows[i]["date"],
                        "value": round(apb_ts[i], 8),  # type: ignore[arg-type]
                        "window": window,
                    }
                )
                break

    if not latest:
        raise ValueError("无法计算 APB：窗口内有效成交不足")

    latest.sort(key=lambda x: -x["value"])
    for i, row in enumerate(latest, start=1):
        row["rank"] = i

    assumptions = [
        "方法溯源东方证券量价买卖压力（APB）：窗口内算术均价 / 量权均价。",
        "日频代理：用成交额/量或典型价 (H+L+C)/3 作为日均价；默认对 APB 取对数。",
        f"window={window}, min_days={min_days}, log={use_log}。",
        "高 APB 表示价格相对量权成本偏高，解读需结合样本与换手，非买卖指令。",
    ]
    return {
        "ok": True,
        "skill": "volume-price-pressure",
        "signal": latest,
        "series": {"apb": series_rows[-5000:]},
        "metrics": {"window": window, "universe": len(latest), "series_points": len(series_rows)},
        "assumptions": assumptions,
        "errors": [],
    }


def main() -> int:
    ap = argparse.ArgumentParser(description="Volume-price pressure (APB)")
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
            "skill": "volume-price-pressure",
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
