#!/usr/bin/env python3
"""改进 HHT 择时：希尔伯特相位代理（无 EMD 库） 纯 stdlib。"""
from __future__ import annotations

import argparse
import json
import math
import sys
from collections import defaultdict
from typing import Any

SKILL = "hht-timing"



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
    if n <= 0:
        return out
    s = 0.0
    for i, v in enumerate(xs):
        s += v
        if i >= n:
            s -= xs[i - n]
        if i >= n - 1:
            out[i] = s / n
    return out


def _envelope_phase(close: list[float], smooth: int) -> tuple[list[float | None], list[float | None], list[float | None]]:
    """
    无 EMD：用平滑价格相对包络中轴的相位代理。
    analytic ≈ (x - mid) + i * d(x-mid)/dt 的 atan2。
    """
    n = len(close)
    mid = _sma(close, smooth)
    # simple upper/lower envelope via rolling max/min of residuals window
    env_u: list[float | None] = [None] * n
    env_l: list[float | None] = [None] * n
    phase: list[float | None] = [None] * n
    amp: list[float | None] = [None] * n
    w = max(smooth, 5)
    for i in range(n):
        if mid[i] is None or i < w:
            continue
        window = close[i - w + 1 : i + 1]
        m = mid[i]
        assert m is not None
        env_u[i] = max(window)
        env_l[i] = min(window)
        # quadrature: difference of residuals
        re = close[i] - m
        im = 0.0
        if i > 0 and mid[i - 1] is not None:
            im = (close[i] - mid[i]) - (close[i - 1] - mid[i - 1])  # type: ignore[operator]
        ph = math.atan2(im, re) if (re != 0 or im != 0) else 0.0
        phase[i] = ph
        amp[i] = math.hypot(re, im)
    return phase, amp, mid


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
    smooth = int(params.get("smooth") or 10)
    symbol = params.get("symbol")
    panels = payload.get("panels") if isinstance(payload.get("panels"), dict) else {}
    use_hilbert_only = bool(params.get("use_hilbert_only"))
    emd = panels.get("emd") or panels.get("imf")
    missing = ["panels.emd", "panels.imf"]
    bars_raw = payload.get("bars")
    if not isinstance(bars_raw, list) or not bars_raw:
        raise ValueError("input.bars 须为非空")
    bars = sorted(_pick_symbol_bars(bars_raw, str(symbol) if symbol else None), key=lambda b: str(b.get("date", "")))
    if len(bars) < smooth + 10:
        raise ValueError("bars 不足")
    dates = [str(b.get("date", "")) for b in bars]
    close = [float(b["close"]) for b in bars]
    sym = str(bars[0].get("symbol", ""))

    # Full path: precomputed EMD/IMF phase or residual
    if isinstance(emd, list) and emd and not use_hilbert_only:
        # rows: {date, phase} or {date, imf1,...} — prefer phase; else use first imf as residual
        phase_map: dict[str, float] = {}
        amp_map: dict[str, float] = {}
        for r in emd:
            if not isinstance(r, dict):
                continue
            d = str(r.get("date") or "")
            if "phase" in r:
                try:
                    phase_map[d] = float(r["phase"])
                except (TypeError, ValueError):
                    pass
            elif "imf1" in r or "value" in r:
                try:
                    phase_map[d] = float(r.get("imf1") if "imf1" in r else r["value"])
                except (TypeError, ValueError):
                    pass
            if "amplitude" in r or "amp" in r:
                try:
                    amp_map[d] = float(r.get("amplitude") if "amplitude" in r else r["amp"])
                except (TypeError, ValueError):
                    pass
        if len(phase_map) >= smooth:
            phase = [phase_map.get(d) for d in dates]
            amp = [amp_map.get(d) for d in dates]
            mid = _sma(close, smooth)
            signal_vals: list[float] = []
            last = 0.0
            for i in range(len(phase)):
                ph = phase[i]
                if ph is None or i == 0 or phase[i - 1] is None:
                    signal_vals.append(last)
                    continue
                prev = phase[i - 1]
                if prev < 0 <= ph:
                    last = 1.0
                elif prev > 0 >= ph:
                    last = -1.0
                signal_vals.append(last)
            signal = [{"date": d, "symbol": sym, "value": v} for d, v in zip(dates, signal_vals)]
            series = {
                "phase": [{"date": d, "value": v} for d, v in zip(dates, phase) if v is not None],
                "amplitude": [{"date": d, "value": v} for d, v in zip(dates, amp) if v is not None],
                "mid": [{"date": d, "value": v} for d, v in zip(dates, mid) if v is not None],
            }
            return {
                "ok": True,
                "skill": SKILL,
                "signal": signal,
                "series": series,
                "metrics": {
                    "bars": len(bars),
                    "symbol": sym,
                    "smooth": smooth,
                    "last_signal": signal_vals[-1] if signal_vals else 0.0,
                    "last_phase": phase[-1],
                },
                "assumptions": [
                    "使用 panels.emd/imf 预计算结果生成相位穿越信号。",
                    "非完整 HHT+分类器策略。",
                ],
                "errors": [],
                "meta": _data_meta("full", ["panels.emd|imf", "bars.daily"], []),
            }

    phase, amp, mid = _envelope_phase(close, smooth)
    signal_vals = []
    last = 0.0
    for i in range(len(phase)):
        ph = phase[i]
        if ph is None or i == 0 or phase[i - 1] is None:
            signal_vals.append(last)
            continue
        prev = phase[i - 1]
        assert prev is not None
        if prev < 0 <= ph:
            last = 1.0
        elif prev > 0 >= ph:
            last = -1.0
        signal_vals.append(last)
    signal = [{"date": d, "symbol": sym, "value": v} for d, v in zip(dates, signal_vals)]
    series = {
        "phase": [{"date": d, "value": v} for d, v in zip(dates, phase) if v is not None],
        "amplitude": [{"date": d, "value": v} for d, v in zip(dates, amp) if v is not None],
        "mid": [{"date": d, "value": v} for d, v in zip(dates, mid) if v is not None],
    }
    reason = "hilbert_phase_proxy_no_emd"
    if use_hilbert_only:
        reason = "params.use_hilbert_only"
    return {
        "ok": True,
        "skill": SKILL,
        "signal": signal,
        "series": series,
        "metrics": {
            "bars": len(bars),
            "symbol": sym,
            "smooth": smooth,
            "last_signal": signal_vals[-1] if signal_vals else 0.0,
            "last_phase": phase[-1],
        },
        "assumptions": [
            "无 PyEMD/VMD 结果：用平滑中轴+包络残差的 atan2 相位代理希尔伯特瞬时相位。",
            "非完整 HHT+分类器策略。",
        ],
        "errors": [],
        "meta": _data_meta("proxy", ["bars.daily"], missing, reason=reason),
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
