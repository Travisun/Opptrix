#!/usr/bin/env python3
"""小波择时：panels.wavelet_coeffs → full；多尺度 SMA → proxy。纯 stdlib。"""
from __future__ import annotations

import argparse
import json
import math
import sys
from collections import defaultdict
from typing import Any

SKILL = "wavelet-timing"



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

def _sma(xs: list[float], n: int) -> list[float | None]:
    out: list[float | None] = [None] * len(xs)
    s = 0.0
    for i, v in enumerate(xs):
        s += v
        if i >= n:
            s -= xs[i - n]
        if i >= n - 1:
            out[i] = s / n
    return out


def _pick_symbol_bars(bars: list[dict[str, Any]], symbol: str | None) -> list[dict[str, Any]]:
    if symbol:
        rows = [b for b in bars if str(b.get("symbol", "")) == symbol]
        if rows:
            return rows
    counts: dict[str, int] = defaultdict(int)
    for b in bars:
        counts[str(b.get("symbol", ""))] += 1
    top = max(counts, key=counts.get) if counts else ""
    return [b for b in bars if str(b.get("symbol", "")) == top]


def compute(payload: dict[str, Any]) -> dict[str, Any]:
    params = payload.get("params") if isinstance(payload.get("params"), dict) else {}
    scales = params.get("scales") or [5, 10, 20, 40]
    scales = [int(x) for x in scales]
    symbol = params.get("symbol")
    panels = payload.get("panels") if isinstance(payload.get("panels"), dict) else {}
    wcoeffs = panels.get("wavelet_coeffs")
    bars_raw = payload.get("bars")
    if not isinstance(bars_raw, list) or not bars_raw:
        raise ValueError("input.bars 须为非空")
    bars = sorted(_pick_symbol_bars(bars_raw, str(symbol) if symbol else None), key=lambda b: str(b.get("date", "")))
    if len(bars) < max(scales) + 5:
        raise ValueError("bars 不足")
    dates = [str(b.get("date", "")) for b in bars]
    close = [float(b["close"]) for b in bars]
    sym = str(bars[0].get("symbol", ""))

    # Full: precomputed wavelet detail coeffs → vote on detail sign energy
    if isinstance(wcoeffs, list) and wcoeffs:
        by_date: dict[str, float] = {}
        for r in wcoeffs:
            if not isinstance(r, dict):
                continue
            d = str(r.get("date") or "")
            try:
                # prefer detail/energy/value
                v = r.get("detail")
                if v is None:
                    v = r.get("energy")
                if v is None:
                    v = r.get("value")
                by_date[d] = float(v)
            except (TypeError, ValueError):
                continue
        if len(by_date) >= max(scales):
            signal_vals = []
            last = 0.0
            detail_series = {"wavelet_detail": []}
            for d in dates:
                v = by_date.get(d)
                if v is None:
                    signal_vals.append(last)
                    continue
                last = 1.0 if v > 0 else (-1.0 if v < 0 else 0.0)
                signal_vals.append(last)
                detail_series["wavelet_detail"].append({"date": d, "value": v})
            signal = [{"date": d, "symbol": sym, "value": v} for d, v in zip(dates, signal_vals)]
            return {
                "ok": True, "skill": SKILL, "signal": signal, "series": detail_series,
                "metrics": {"bars": len(bars), "symbol": sym, "scales": scales,
                            "last_signal": signal_vals[-1] if signal_vals else 0.0},
                "assumptions": ["使用 panels.wavelet_coeffs 细节/能量符号择时。"],
                "errors": [],
                "meta": _data_meta("full", ["panels.wavelet_coeffs", "bars.daily"], []),
            }

    mas = {str(sc): _sma(close, sc) for sc in scales}
    # Detail proxy: short MA - longer MA cascade vote
    signal_vals: list[float] = []
    detail_series: dict[str, list[dict[str, Any]]] = {}
    ordered = sorted(scales)
    for i in range(len(close)):
        votes = 0
        valid = 0
        for a, b in zip(ordered[:-1], ordered[1:]):
            va, vb = mas[str(a)][i], mas[str(b)][i]
            if va is None or vb is None:
                continue
            valid += 1
            votes += 1 if va > vb else (-1 if va < vb else 0)
        if valid == 0:
            signal_vals.append(0.0)
        else:
            signal_vals.append(1.0 if votes > 0 else (-1.0 if votes < 0 else 0.0))
    for sc, series in mas.items():
        detail_series[f"ma_{sc}"] = [{"date": d, "value": v} for d, v in zip(dates, series) if v is not None]
    # multi-scale energy proxy
    energy = []
    for i in range(len(close)):
        parts = []
        for a, b in zip(ordered[:-1], ordered[1:]):
            va, vb = mas[str(a)][i], mas[str(b)][i]
            if va is not None and vb is not None:
                parts.append(abs(va - vb))
        energy.append(sum(parts) / len(parts) if parts else None)
    detail_series["scale_energy"] = [{"date": d, "value": v} for d, v in zip(dates, energy) if v is not None]
    signal = [{"date": d, "symbol": sym, "value": v} for d, v in zip(dates, signal_vals)]
    return {
        "ok": True,
        "skill": SKILL,
        "signal": signal,
        "series": detail_series,
        "metrics": {
            "bars": len(bars),
            "symbol": sym,
            "scales": scales,
            "last_signal": signal_vals[-1] if signal_vals else 0.0,
        },
        "assumptions": [
            "无 scipy 小波：多尺度 SMA 差值投票代理小波细节系数择时。",
            "无 SVM 分类路径。",
        ],
        "errors": [],
        "meta": _data_meta("proxy", ["bars.daily"], ["panels.wavelet_coeffs"], reason="multiscale_ma_proxy_no_wavelet"),
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
