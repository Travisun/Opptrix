#!/usr/bin/env python3
"""SignalMaker NoiseArea：分钟噪声区域上下界与突破信号（纯 stdlib）。

缺分钟：ok=false（默认）或 params.allow_daily_degraded=true 时日频降级。
"""
from __future__ import annotations

import argparse
import json
import sys
from collections import defaultdict
from typing import Any

SKILL = "signal-noise-area"



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


def day_key(ds: str) -> str:
    return ds.replace(" ", "T").split("T")[0][:10]


def time_key(ds: str) -> str:
    s = ds.replace(" ", "T")
    if "T" in s:
        return s.split("T", 1)[1][:8]
    return ""


def compute(payload: dict[str, Any]) -> dict[str, Any]:
    params = payload.get("params") if isinstance(payload.get("params"), dict) else {}
    window = int(params.get("window") or 14)
    allow_daily = bool(params.get("allow_daily_degraded") or False)
    symbol = params.get("symbol")
    bars_raw = payload.get("bars")
    if not isinstance(bars_raw, list) or not bars_raw:
        return {
            "ok": False, "skill": SKILL, "signal": [], "series": {}, "metrics": {},
            "assumptions": [], "errors": ["input.bars 须为非空"], "meta": _data_meta("insufficient", [], ["bars"]),
        }
    rows = [b for b in bars_raw if isinstance(b, dict)]
    if symbol:
        f = [b for b in rows if str(b.get("symbol", "")) == str(symbol)]
        if f:
            rows = f
    intra = [b for b in rows if is_intraday_date(str(b.get("date", "")))]
    daily = [b for b in rows if not is_intraday_date(str(b.get("date", "")))]

    if len(intra) < max(20, window * 2):
        if not allow_daily or len(daily) < window + 5:
            return {
                "ok": False,
                "skill": SKILL,
                "signal": [],
                "series": {},
                "metrics": {"intraday_bars": len(intra), "daily_bars": len(daily)},
                "assumptions": [],
                "errors": ["缺少分钟 bars：NoiseArea 需要日内 OHLCV；或设 params.allow_daily_degraded=true 并提供日 K"],
                "meta": _data_meta("insufficient", [], ["bars.minute"]),
            }
        # daily degraded path
        daily = sorted(daily, key=lambda b: str(b.get("date", "")))
        sym = str(daily[0].get("symbol", ""))
        closes = [float(b["close"]) for b in daily]
        # proxy noise band = rolling mean abs return
        signal = []
        upper = []; lower = []
        for i in range(len(daily)):
            if i < window:
                continue
            rets = [abs(closes[j] / closes[j - 1] - 1) for j in range(i - window + 1, i + 1)]
            sigma = sum(rets) / window
            u = closes[i] * (1 + sigma)
            l = closes[i] * (1 - sigma)
            val = 1.0 if closes[i] > u else (-1.0 if closes[i] < l else 0.0)
            d = str(daily[i].get("date", ""))
            signal.append({"date": d, "symbol": sym, "value": val})
            upper.append({"date": d, "value": u})
            lower.append({"date": d, "value": l})
        return {
            "ok": True,
            "skill": SKILL,
            "signal": signal,
            "series": {"upperbound": upper, "lowerbound": lower},
            "metrics": {"bars": len(daily), "symbol": sym, "mode": "daily_degraded", "window": window},
            "assumptions": ["缺分钟：日频振幅代理噪声带，精度显著下降。"],
            "errors": [],
            "meta": _data_meta("proxy", ["bars.daily"], ["bars.minute"], reason="daily_proxy_no_minute_bars"),
        }

    bars = sorted(intra, key=lambda b: str(b.get("date", "")))
    sym = str(bars[0].get("symbol", ""))
    by_day: dict[str, list] = defaultdict(list)
    for b in bars:
        by_day[day_key(str(b.get("date", "")))].append(b)
    days = sorted(by_day.keys())
    day_open = {d: float(by_day[d][0].get("open", by_day[d][0]["close"])) for d in days}
    day_close = {d: float(by_day[d][-1]["close"]) for d in days}

    # distance |close/day_open - 1| by clock slot across days
    slot_hist: dict[str, list[float]] = defaultdict(list)
    for d in days:
        o = day_open[d]
        if o <= 0:
            continue
        for b in by_day[d]:
            tk = time_key(str(b.get("date", "")))
            c = float(b["close"])
            slot_hist[tk].append(abs(c / o - 1.0))

    # rolling mean sigma per slot using chronological day order
    # build per-bar sigma from past window days same clock
    day_index = {d: i for i, d in enumerate(days)}
    signal = []
    series_u = []; series_l = []; series_vwap = []
    for d in days:
        rows_d = by_day[d]
        # cumulative vwap
        cv = 0.0; cq = 0.0
        prev_d = days[day_index[d] - 1] if day_index[d] > 0 else None
        prev_close = day_close[prev_d] if prev_d else day_open[d]
        for b in rows_d:
            c = float(b["close"]); v = float(b.get("volume") or 0.0)
            cv += c * v; cq += v
            vwap = (cv / cq) if cq > 0 else c
            tk = time_key(str(b.get("date", "")))
            # sigma: mean of last `window` days same slot
            hist = []
            for dd in days[max(0, day_index[d] - window) : day_index[d]]:
                for bb in by_day[dd]:
                    if time_key(str(bb.get("date", ""))) == tk:
                        oo = day_open[dd]
                        if oo > 0:
                            hist.append(abs(float(bb["close"]) / oo - 1.0))
            sigma = (sum(hist) / len(hist)) if hist else 0.0
            thr_u = max(day_open[d], prev_close)
            thr_l = min(day_open[d], prev_close)
            upper = thr_u * (1 + sigma)
            lower = thr_l * (1 - sigma)
            if c > upper:
                val = 1.0
            elif c < lower:
                val = -1.0
            else:
                val = 0.0
            ds = str(b.get("date", ""))
            signal.append({"date": ds, "symbol": sym, "value": val})
            series_u.append({"date": ds, "value": upper})
            series_l.append({"date": ds, "value": lower})
            series_vwap.append({"date": ds, "value": vwap})

    return {
        "ok": True,
        "skill": SKILL,
        "signal": signal,
        "series": {"upperbound": series_u, "lowerbound": series_l, "vwap": series_vwap},
        "metrics": {
            "bars": len(bars),
            "days": len(days),
            "symbol": sym,
            "window": window,
            "mode": "intraday",
            "last_signal": signal[-1]["value"] if signal else 0.0,
        },
        "assumptions": [
            "NoiseArea：按同时钟历史距离估计 sigma，上下界突破为日内动量信号。",
            "配套 etf-intraday-momentum；signal-utils-shared 已并入。",
        ],
        "errors": [],
        "meta": _data_meta("full", ["bars.minute"], []),
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
