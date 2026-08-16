#!/usr/bin/env python3
"""扩散指标：多标的涨跌/站上均线广度，双均线择时状态。纯 stdlib。"""
from __future__ import annotations

import argparse
import json
import math
import sys
from collections import defaultdict
from typing import Any


def _sma(xs: list[float | None], n: int) -> list[float | None]:
    out: list[float | None] = [None] * len(xs)
    for i in range(len(xs)):
        if i + 1 < n:
            continue
        chunk = xs[i + 1 - n : i + 1]
        finite = [v for v in chunk if v is not None and math.isfinite(v)]
        if len(finite) < max(1, n // 2):
            continue
        out[i] = sum(finite) / len(finite)
    return out


def _load_bars(payload: dict[str, Any]) -> list[dict[str, Any]]:
    bars = payload.get("bars")
    if not isinstance(bars, list) or not bars:
        raise ValueError("input.bars 须为多标的日 K 数组")
    out: list[dict[str, Any]] = []
    for b in bars:
        if not isinstance(b, dict):
            continue
        try:
            c = float(b["close"])
        except (KeyError, TypeError, ValueError):
            continue
        if not math.isfinite(c) or c <= 0:
            continue
        out.append(
            {
                "date": str(b.get("date") or ""),
                "symbol": str(b.get("symbol") or ""),
                "close": c,
            }
        )
    if len(out) < 10:
        raise ValueError("有效 bars 不足")
    return out


def compute(payload: dict[str, Any]) -> dict[str, Any]:
    params = payload.get("params") if isinstance(payload.get("params"), dict) else {}
    ma_n = int(params.get("ma_n") or params.get("N") or 60)
    fast_n = int(params.get("fast") or params.get("N1") or 20)
    slow_n = int(params.get("slow") or params.get("N2") or 10)
    mode = str(params.get("mode") or "advance").lower()  # advance | above_ma
    # advance: 上涨家数占比；above_ma: 收盘站上 N 日均线家数占比
    if ma_n < 2 or fast_n < 2 or slow_n < 2:
        raise ValueError("均线参数须 >= 2")

    bars = _load_bars(payload)
    by_date: dict[str, list[dict[str, Any]]] = defaultdict(list)
    by_sym: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for b in bars:
        by_date[b["date"]].append(b)
        by_sym[b["symbol"]].append(b)

    dates = sorted(d for d in by_date.keys() if d)
    if len(dates) < max(ma_n, fast_n + slow_n) // 2:
        raise ValueError("交易日序列过短")

    # 预计算各标的收盘与均线
    close_map: dict[str, dict[str, float]] = {}
    ma_map: dict[str, dict[str, float]] = {}
    for sym, rows in by_sym.items():
        rows = sorted(rows, key=lambda r: r["date"])
        closes = [r["close"] for r in rows]
        dlist = [r["date"] for r in rows]
        close_map[sym] = {d: c for d, c in zip(dlist, closes)}
        ma_vals = _sma([float(c) for c in closes], ma_n)
        ma_map[sym] = {
            d: mv for d, mv in zip(dlist, ma_vals) if mv is not None and math.isfinite(mv)
        }

    breadth: list[float | None] = []
    advance_ratio: list[float | None] = []
    above_ratio: list[float | None] = []
    counts: list[dict[str, Any]] = []

    prev_close: dict[str, float] = {}
    for d in dates:
        ups = 0
        downs = 0
        flats = 0
        above = 0
        below = 0
        n_adv = 0
        n_ma = 0
        for b in by_date[d]:
            sym = b["symbol"]
            c = b["close"]
            if sym in prev_close:
                n_adv += 1
                if c > prev_close[sym]:
                    ups += 1
                elif c < prev_close[sym]:
                    downs += 1
                else:
                    flats += 1
            prev_close[sym] = c
            mv = ma_map.get(sym, {}).get(d)
            if mv is not None:
                n_ma += 1
                if c > mv:
                    above += 1
                else:
                    below += 1

        ar = (ups / n_adv) if n_adv > 0 else None
        mr = (above / n_ma) if n_ma > 0 else None
        advance_ratio.append(ar)
        above_ratio.append(mr)
        if mode == "above_ma":
            breadth.append(mr)
        else:
            breadth.append(ar)
        counts.append(
            {
                "date": d,
                "ups": ups,
                "downs": downs,
                "flats": flats,
                "above_ma": above,
                "below_ma": below,
                "n_advance": n_adv,
                "n_ma": n_ma,
            }
        )

    fast = _sma(breadth, fast_n)
    slow = _sma(fast, slow_n)

    signal: list[dict[str, Any]] = []
    state = 0
    for i, d in enumerate(dates):
        f = fast[i]
        s = slow[i]
        b = breadth[i]
        if f is None or s is None or b is None:
            continue
        if f > s:
            state = 1
        elif f < s:
            state = 0
        signal.append(
            {
                "date": d,
                "value": state,
                "breadth": round(b, 6),
                "fast": round(f, 6),
                "slow": round(s, 6),
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
        "方法溯源东北证券扩散指标：市场广度序列 + 双均线状态。",
        f"mode={mode}（advance=上涨家数占比；above_ma=站上 {ma_n} 日均线占比）。",
        f"快线 SMA({fast_n})，慢线对快线再 SMA({slow_n})；快>慢 → 偏多状态 1。",
        "需 Agent 提供成分/宇宙多标的日 K；广度样本非全市场时须披露。",
    ]
    return {
        "ok": True,
        "skill": "breadth-diffusion",
        "signal": signal,
        "series": {
            "breadth": pts(breadth),
            "advance_ratio": pts(advance_ratio),
            "above_ma_ratio": pts(above_ratio),
            "fast": pts(fast),
            "slow": pts(slow),
            "counts": counts[-500:],
        },
        "metrics": {
            "mode": mode,
            "ma_n": ma_n,
            "fast": fast_n,
            "slow": slow_n,
            "dates": len(dates),
            "symbols": len(by_sym),
            "last_signal": last["value"] if last else None,
            "last_breadth": last["breadth"] if last else None,
        },
        "assumptions": assumptions,
        "errors": [],
    }


def main() -> int:
    ap = argparse.ArgumentParser(description="Breadth diffusion timing")
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
            "skill": "breadth-diffusion",
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
