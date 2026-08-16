#!/usr/bin/env python3
"""A股动量构造：按日振幅切割涨跌幅（低振幅日求和 = 动量 A）。纯 stdlib。"""
from __future__ import annotations

import argparse
import json
import math
import sys
from collections import defaultdict
from typing import Any


def _load_bars(payload: dict[str, Any]) -> list[dict[str, Any]]:
    bars = payload.get("bars")
    if not isinstance(bars, list) or not bars:
        raise ValueError("input.bars 须为非空 OHLCV 数组")
    out: list[dict[str, Any]] = []
    for b in bars:
        if not isinstance(b, dict):
            continue
        try:
            h = float(b["high"])
            l = float(b["low"])
            c = float(b["close"])
        except (KeyError, TypeError, ValueError):
            continue
        if not all(math.isfinite(x) for x in (h, l, c)) or c <= 0 or l <= 0 or h <= 0:
            continue
        out.append(
            {
                "date": str(b.get("date") or ""),
                "symbol": str(b.get("symbol") or ""),
                "high": h,
                "low": l,
                "close": c,
            }
        )
    if len(out) < 10:
        raise ValueError("有效 bars 不足")
    out.sort(key=lambda r: (r["symbol"], r["date"]))
    return out


def _factor_for_window(
    rows: list[dict[str, Any]], window: int, lamb: float
) -> tuple[float | None, float | None, str]:
    """
    步骤（开源证券）：
    1) 近 N 日振幅 = high/low - 1
    2) 低振幅 λ 比例交易日的涨跌幅加总 → A（动量）
    3) 高振幅部分加总 → B（偏反转）
    """
    if len(rows) < window + 1:
        return None, None, ""
    chunk = rows[-(window + 1) :]
    # 日收益与振幅对齐到 chunk[1:]
    items: list[tuple[float, float]] = []  # (amplitude, ret)
    for i in range(1, len(chunk)):
        prev_c = chunk[i - 1]["close"]
        r = chunk[i]
        if prev_c <= 0:
            continue
        ret = r["close"] / prev_c - 1.0
        amp = r["high"] / r["low"] - 1.0
        if not math.isfinite(ret) or not math.isfinite(amp):
            continue
        items.append((amp, ret))
    if len(items) < max(5, window // 2):
        return None, None, ""
    # 取最近 window 个
    items = items[-window:]
    n = len(items)
    k = max(1, int(math.floor(n * lamb)))
    k = min(k, n)
    ordered = sorted(range(n), key=lambda i: items[i][0])
    low_idx = ordered[:k]
    high_idx = ordered[n - k :]
    a = sum(items[i][1] for i in low_idx)
    b = sum(items[i][1] for i in high_idx)
    asof = chunk[-1]["date"]
    return a, b, asof


def compute(payload: dict[str, Any]) -> dict[str, Any]:
    params = payload.get("params") if isinstance(payload.get("params"), dict) else {}
    window = int(params.get("window") or params.get("N") or 120)
    lamb = float(params.get("lambda") or params.get("lamb") or 0.3)
    windows_raw = params.get("windows")
    multi: list[int] = []
    if isinstance(windows_raw, list) and windows_raw:
        multi = [int(x) for x in windows_raw]
    else:
        multi = [window]
    if lamb <= 0 or lamb > 1:
        raise ValueError("lambda 须在 (0,1]")
    for w in multi:
        if w < 10:
            raise ValueError("window 须 >= 10")

    bars = _load_bars(payload)
    by_sym: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for b in bars:
        by_sym[b["symbol"]].append(b)

    primary_w = multi[0]
    ranking: list[dict[str, Any]] = []
    multi_series: dict[str, list[dict[str, Any]]] = {f"A_{w}": [] for w in multi}
    multi_series.update({f"B_{w}": [] for w in multi})

    for sym, rows in by_sym.items():
        rows = sorted(rows, key=lambda r: r["date"])
        entry: dict[str, Any] = {"symbol": sym}
        for w in multi:
            a, b, asof = _factor_for_window(rows, w, lamb)
            if a is None:
                continue
            entry[f"A_{w}"] = round(a, 8)
            entry[f"B_{w}"] = round(b, 8)
            entry["date"] = asof
            multi_series[f"A_{w}"].append({"symbol": sym, "date": asof, "value": round(a, 8)})
            multi_series[f"B_{w}"].append({"symbol": sym, "date": asof, "value": round(b, 8)})
        key = f"A_{primary_w}"
        if key not in entry:
            continue
        entry["value"] = entry[key]
        ranking.append(entry)

    if not ranking:
        raise ValueError("无标的满足窗口，无法构造动量因子")

    ranking.sort(key=lambda x: -x["value"])
    for i, row in enumerate(ranking, start=1):
        row["rank"] = i

    assumptions = [
        "方法溯源开源证券《A股市场中如何构造动量因子》：按日振幅切割涨跌幅。",
        f"低振幅 λ={lamb} 比例交易日收益加总为 A（动量）；高振幅对应 B（偏反转）。",
        f"主窗口 N={primary_w}；额外窗口={multi}。",
        "A 股短端常呈反转，本因子试图从长端切割动量；结果非荐股。",
    ]
    return {
        "ok": True,
        "skill": "cn-momentum-construct",
        "signal": ranking,
        "series": multi_series,
        "metrics": {
            "window": primary_w,
            "windows": multi,
            "lambda": lamb,
            "universe": len(ranking),
        },
        "assumptions": assumptions,
        "errors": [],
    }


def main() -> int:
    ap = argparse.ArgumentParser(description="CN momentum construct")
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
            "skill": "cn-momentum-construct",
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
