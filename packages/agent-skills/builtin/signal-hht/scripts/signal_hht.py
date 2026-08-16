#!/usr/bin/env python3
"""SignalMaker HHT 信号：有 panels.emd/imf → full；否则相位代理 → proxy。"""
from __future__ import annotations

import argparse
import json
import math
import sys
from collections import defaultdict
from typing import Any

SKILL = "signal-hht"



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


def _envelope_phase(close: list[float], smooth: int):
    n = len(close)
    mid = _sma(close, smooth)
    phase: list[float | None] = [None] * n
    amp: list[float | None] = [None] * n
    w = max(smooth, 5)
    for i in range(n):
        if mid[i] is None or i < w:
            continue
        m = mid[i]
        re = close[i] - m  # type: ignore[operator]
        im = 0.0
        if i > 0 and mid[i - 1] is not None:
            im = (close[i] - mid[i]) - (close[i - 1] - mid[i - 1])  # type: ignore[operator]
        phase[i] = math.atan2(im, re) if (re != 0 or im != 0) else 0.0
        amp[i] = math.hypot(re, im)
    return phase, amp, mid


def compute(payload: dict[str, Any]) -> dict[str, Any]:
    panels = payload.get("panels") if isinstance(payload.get("panels"), dict) else {}
    use_hilbert_only = bool((payload.get("params") or {}).get("use_hilbert_only")) if isinstance(payload.get("params"), dict) else False
    emd_panel = panels.get("emd") or panels.get("imf")
    _missing_emd = ["panels.emd", "panels.imf"]
    params = payload.get("params") if isinstance(payload.get("params"), dict) else {}
    smooth = int(params.get("smooth") or 10)
    lo = float(params.get("phase_low") or -0.5)
    hi = float(params.get("phase_high") or 0.5)
    symbol = params.get("symbol")
    bars_raw = payload.get("bars")
    if not isinstance(bars_raw, list) or not bars_raw:
        raise ValueError("input.bars 须为非空")
    counts: dict[str, int] = defaultdict(int)
    for b in bars_raw:
        if isinstance(b, dict):
            counts[str(b.get("symbol", ""))] += 1
    top = str(symbol) if symbol else (max(counts, key=counts.get) if counts else "")
    bars = sorted([b for b in bars_raw if isinstance(b, dict) and str(b.get("symbol", "")) == top],
                  key=lambda b: str(b.get("date", "")))
    if len(bars) < smooth + 10:
        raise ValueError("bars 不足")
    dates = [str(b.get("date", "")) for b in bars]
    close = [float(b["close"]) for b in bars]
    mid = _sma(close, smooth)
    used_full = False
    phase: list[float | None]
    amp: list[float | None]
    if isinstance(emd_panel, list) and emd_panel and not use_hilbert_only:
        phase_map: dict[str, float] = {}
        amp_map: dict[str, float] = {}
        for r in emd_panel:
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
            used_full = True
        else:
            phase, amp, mid = _envelope_phase(close, smooth)
    else:
        phase, amp, mid = _envelope_phase(close, smooth)
    signal = []
    last_dir = 0.0
    for i, d in enumerate(dates):
        ph = phase[i]
        if ph is None:
            signal.append({"date": d, "symbol": top, "value": last_dir})
            continue
        if i > 0 and phase[i - 1] is not None:
            prev = phase[i - 1]
            if prev < 0 <= ph:  # type: ignore[operator]
                last_dir = 1.0
            elif prev > 0 >= ph:  # type: ignore[operator]
                last_dir = -1.0
        in_band = 1.0 if lo <= ph <= hi else 0.0
        signal.append({"date": d, "symbol": top, "value": last_dir, "phase_in_band": in_band})
    assumptions = (
        ["使用 panels.emd/imf 相位生成 SignalMaker HHT 信号。"]
        if used_full
        else ["无 PyEMD/VMD 结果：用平滑中轴残差 atan2 作瞬时相位代理。"]
    )
    assumptions.append("与 hht-timing 算法同源；本 skill 为 SignalMaker 模块名。")
    return {
        "ok": True,
        "skill": SKILL,
        "signal": signal,
        "series": {
            "phase": [{"date": d, "value": v} for d, v in zip(dates, phase) if v is not None],
            "amplitude": [{"date": d, "value": v} for d, v in zip(dates, amp) if v is not None],
            "mid": [{"date": d, "value": v} for d, v in zip(dates, mid) if v is not None],
        },
        "metrics": {
            "bars": len(bars),
            "symbol": top,
            "smooth": smooth,
            "last_signal": signal[-1]["value"] if signal else 0.0,
            "last_phase": phase[-1],
        },
        "assumptions": assumptions,
        "errors": [],
        "meta": (
            _data_meta("full", ["panels.emd|imf", "bars.daily"], [])
            if used_full
            else _data_meta("proxy", ["bars.daily"], _missing_emd, reason="hilbert_phase_proxy_no_emd")
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
