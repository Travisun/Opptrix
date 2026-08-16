#!/usr/bin/env python3
"""ETF 日内动量 + NoiseArea（纯 Python）。

C-择时类/另类ETF交易策略：日内动量。

若仅有日 K：走日频降级路径，并在 output.meta.degraded=true 声明。
"""
from __future__ import annotations

import argparse
import json
import sys
from collections import defaultdict
from typing import Any, Dict, List, Optional, Sequence


SKILL = "etf-intraday-momentum"



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

def is_intraday_date(s: str) -> bool:
    return ("T" in s) or (" " in s and ":" in s)


def detect_mode(bars: Sequence[Dict[str, Any]]) -> str:
    if not bars:
        return "empty"
    hits = sum(1 for b in bars if is_intraday_date(str(b.get("date", ""))))
    if hits >= max(3, len(bars) // 2):
        return "intraday"
    return "daily"


def pick_symbol_bars(bars: List[Dict[str, Any]], symbol: Optional[str]) -> List[Dict[str, Any]]:
    if not bars:
        return []
    if symbol:
        rows = [b for b in bars if str(b.get("symbol", "")) == symbol]
        if rows:
            return rows
    counts: Dict[str, int] = {}
    for b in bars:
        s = str(b.get("symbol", ""))
        counts[s] = counts.get(s, 0) + 1
    top = max(counts, key=counts.get) if counts else ""
    return [b for b in bars if str(b.get("symbol", "")) == top] if top else list(bars)


def day_key(ds: str) -> str:
    return ds.replace(" ", "T").split("T")[0][:10]


def rolling_mean(xs: Sequence[Optional[float]], window: int) -> List[Optional[float]]:
    out: List[Optional[float]] = [None] * len(xs)
    for i in range(len(xs)):
        if i + 1 < window:
            continue
        chunk = xs[i + 1 - window : i + 1]
        if any(v is None for v in chunk):
            continue
        out[i] = sum(float(v) for v in chunk) / window  # type: ignore[arg-type]
    return out


def run_intraday(bars: List[Dict[str, Any]], window: int) -> Dict[str, Any]:
    """NoiseArea：按 clock-of-day 估计距离波动，构造上下界；突破则动量信号。"""
    bars = sorted(bars, key=lambda b: str(b.get("date", "")))
    sym = str(bars[0].get("symbol", ""))

    by_day: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    for b in bars:
        by_day[day_key(str(b.get("date", "")))].append(b)

    days = sorted(by_day.keys())
    # 日开盘 / 昨收
    day_open: Dict[str, float] = {}
    day_close: Dict[str, float] = {}
    for d in days:
        rows = by_day[d]
        day_open[d] = float(rows[0].get("open", rows[0]["close"]))
        day_close[d] = float(rows[-1]["close"])

    # 每个 bar：相对开盘距离、累计 VWAP
    dates: List[str] = []
    close_s: List[float] = []
    vwap_s: List[float] = []
    distance: List[float] = []
    clock: List[str] = []
    day_of: List[str] = []

    for d in days:
        cum_pv = 0.0
        cum_v = 0.0
        o = day_open[d]
        for b in by_day[d]:
            ds = str(b.get("date", ""))
            c = float(b["close"])
            v = float(b.get("volume") or 0.0)
            cum_pv += c * v
            cum_v += v
            vw = (cum_pv / cum_v) if cum_v > 0 else c
            dates.append(ds)
            close_s.append(c)
            vwap_s.append(vw)
            distance.append(abs(c / o - 1.0) if o else 0.0)
            # clock key
            part = ds.replace(" ", "T")
            clock.append(part.split("T", 1)[1] if "T" in part else "00:00:00")
            day_of.append(d)

    # sigma：同 clock 的 rolling mean of distance（按交易日序列）
    clock_hist: Dict[str, List[float]] = defaultdict(list)
    sigma: List[Optional[float]] = [None] * len(dates)
    for i, ck in enumerate(clock):
        clock_hist[ck].append(distance[i])
        hist = clock_hist[ck]
        if len(hist) >= window:
            sigma[i] = sum(hist[-window:]) / window

    upper: List[Optional[float]] = [None] * len(dates)
    lower: List[Optional[float]] = [None] * len(dates)
    prev_close_map: Dict[str, float] = {}
    for i, d in enumerate(days):
        if i > 0:
            prev_close_map[d] = day_close[days[i - 1]]

    for i, d in enumerate(day_of):
        if sigma[i] is None:
            continue
        o = day_open[d]
        pc = prev_close_map.get(d, o)
        thr_u = max(o, pc)
        thr_l = min(o, pc)
        upper[i] = thr_u * (1 + float(sigma[i]))
        lower[i] = thr_l * (1 - float(sigma[i]))

    signal_vals: List[float] = []
    for i, c in enumerate(close_s):
        u, l = upper[i], lower[i]
        if u is None or l is None:
            signal_vals.append(0.0)
        elif c > u:
            signal_vals.append(1.0)
        elif c < l:
            signal_vals.append(-1.0)
        else:
            signal_vals.append(0.0)

    signal = [{"date": d, "symbol": sym, "value": v} for d, v in zip(dates, signal_vals)]
    series = {
        "upperbound": [{"date": d, "value": v} for d, v in zip(dates, upper) if v is not None],
        "lowerbound": [{"date": d, "value": v} for d, v in zip(dates, lower) if v is not None],
        "vwap": [{"date": d, "value": v} for d, v in zip(dates, vwap_s)],
        "sigma": [{"date": d, "value": v} for d, v in zip(dates, sigma) if v is not None],
    }
    metrics = {
        "bars": len(bars),
        "symbol": sym,
        "mode": "intraday",
        "window": window,
        "breakout_up": sum(1 for v in signal_vals if v > 0),
        "breakout_down": sum(1 for v in signal_vals if v < 0),
        "last_signal": signal_vals[-1] if signal_vals else 0.0,
        "sample_note": "示意样本统计，非实盘胜率",
    }
    return {
        "ok": True,
        "skill": SKILL,
        "signal": signal,
        "series": series,
        "metrics": metrics,
        "assumptions": [
            "NoiseArea：价格突破噪声上/下界视为日内动量方向",
            "sigma 按同一日内时刻的历史距离滚动均值估计",
        ],
        "errors": [],
        "meta": {**_data_meta("full", ["bars.minute"], []), "mode": "intraday"},
    }


def run_daily_degraded(bars: List[Dict[str, Any]], window: int) -> Dict[str, Any]:
    """日频代理：用日振幅比例滚动均值作噪声带宽，收盘突破开盘±带宽记信号。"""
    bars = sorted(bars, key=lambda b: str(b.get("date", "")))
    sym = str(bars[0].get("symbol", ""))
    dates = [str(b.get("date", "")) for b in bars]
    opens = [float(b.get("open", b["close"])) for b in bars]
    closes = [float(b["close"]) for b in bars]
    highs = [float(b.get("high", b["close"])) for b in bars]
    lows = [float(b.get("low", b["close"])) for b in bars]

    distance = [abs(c / o - 1.0) if o else 0.0 for o, c in zip(opens, closes)]
    # 也可用 (H-L)/C 作噪声强度
    range_pct = [((h - l) / c) if c else 0.0 for h, l, c in zip(highs, lows, closes)]
    mix = [(d + r) * 0.5 for d, r in zip(distance, range_pct)]
    sigma = rolling_mean(mix, window)

    upper: List[Optional[float]] = [None] * len(bars)
    lower: List[Optional[float]] = [None] * len(bars)
    signal_vals: List[float] = []
    for i in range(len(bars)):
        if sigma[i] is None:
            signal_vals.append(0.0)
            continue
        pc = closes[i - 1] if i > 0 else opens[i]
        thr_u = max(opens[i], pc)
        thr_l = min(opens[i], pc)
        u = thr_u * (1 + float(sigma[i]))
        l = thr_l * (1 - float(sigma[i]))
        upper[i] = u
        lower[i] = l
        c = closes[i]
        if c > u:
            signal_vals.append(1.0)
        elif c < l:
            signal_vals.append(-1.0)
        else:
            signal_vals.append(0.0)

    signal = [{"date": d, "symbol": sym, "value": v} for d, v in zip(dates, signal_vals)]
    series = {
        "upperbound": [{"date": d, "value": v} for d, v in zip(dates, upper) if v is not None],
        "lowerbound": [{"date": d, "value": v} for d, v in zip(dates, lower) if v is not None],
        "sigma": [{"date": d, "value": v} for d, v in zip(dates, sigma) if v is not None],
    }
    metrics = {
        "bars": len(bars),
        "symbol": sym,
        "mode": "daily_degraded",
        "window": window,
        "last_signal": signal_vals[-1] if signal_vals else 0.0,
        "sample_note": "日频降级代理，非完整日内动量复现",
    }
    return {
        "ok": True,
        "skill": SKILL,
        "signal": signal,
        "series": series,
        "metrics": metrics,
        "assumptions": [
            "仅有日 K：无法复现分钟级 NoiseArea，已用日振幅/开收距离代理噪声带宽",
            "日频突破信号仅作状态解读，不可等同原策略日内成交假设",
        ],
        "errors": [],
        "meta": {
            **_data_meta("proxy", ["bars.daily"], ["bars.minute"], reason="daily_noise_band_proxy"),
            "mode": "daily",
        },
    }


def run(payload: Dict[str, Any]) -> Dict[str, Any]:
    params = payload.get("params") or {}
    window = int(params.get("window") or 14)
    symbol = params.get("symbol")
    force = str(params.get("mode") or "").lower()

    bars = pick_symbol_bars(list(payload.get("bars") or []), symbol)
    if len(bars) < max(5, window):
        return {
            "ok": False,
            "skill": SKILL,
            "signal": [],
            "series": {},
            "metrics": {},
            "assumptions": [],
            "errors": [f"bars 不足：需要至少 {max(5, window)} 根"],
            "meta": _data_meta("insufficient", [], ["bars"]),
        }

    mode = force if force in ("intraday", "daily") else detect_mode(bars)
    if mode == "intraday":
        return run_intraday(bars, window)
    return run_daily_degraded(bars, window)


def main(argv: Optional[Sequence[str]] = None) -> int:
    p = argparse.ArgumentParser(description=SKILL)
    p.add_argument("--input", required=True)
    p.add_argument("--output")
    args = p.parse_args(argv)
    try:
        with open(args.input, "r", encoding="utf-8") as f:
            payload = json.load(f)
        result = run(payload)
        text = json.dumps(result, ensure_ascii=False, indent=2)
        if args.output:
            with open(args.output, "w", encoding="utf-8") as f:
                f.write(text)
                f.write("\n")
        print(text)
        return 0 if result.get("ok") else 1
    except Exception as exc:  # noqa: BLE001
        err = {"ok": False, "skill": SKILL, "signal": [], "series": {}, "metrics": {}, "assumptions": [], "errors": [str(exc)], "meta": {}}
        print(json.dumps(err, ensure_ascii=False, indent=2))
        print(str(exc), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
