#!/usr/bin/env python3
"""Trader-Company 多信号规则集成（诚实降级，纯 stdlib）。

完整 TC 为进化/激活函数搜索的元启发集成；本技能用不依赖 sklearn 的多规则信号投票近似，
并在 meta.degraded / assumptions 中声明。
"""
from __future__ import annotations

import argparse
import json
import math
import sys
from typing import Any

SKILL = "trader-company"



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


def _rets(close: list[float]) -> list[float | None]:
    out: list[float | None] = [None]
    for i in range(1, len(close)):
        out.append(close[i] / close[i - 1] - 1.0)
    return out


def _pick(payload: dict[str, Any]) -> list[dict[str, Any]]:
    bars = payload.get("bars")
    if not isinstance(bars, list) or not bars:
        raise ValueError("input.bars 须为非空")
    params = payload.get("params") if isinstance(payload.get("params"), dict) else {}
    symbol = params.get("symbol")
    rows = [b for b in bars if isinstance(b, dict)]
    if symbol:
        f = [b for b in rows if str(b.get("symbol", "")) == str(symbol)]
        if f:
            rows = f
    out = []
    for b in rows:
        try:
            c = float(b["close"])
        except (KeyError, TypeError, ValueError):
            continue
        if c <= 0:
            continue
        out.append({"date": str(b.get("date") or ""), "symbol": str(b.get("symbol") or ""), "close": c,
                    "volume": float(b.get("volume") or 0.0)})
    if len(out) < 40:
        raise ValueError("有效 bars 不足（建议≥40）")
    out.sort(key=lambda r: r["date"])
    return out


def compute(payload: dict[str, Any]) -> dict[str, Any]:
    panels_tc = payload.get("panels") if isinstance(payload.get("panels"), dict) else {}
    tc = panels_tc.get("tc_signals") or panels_tc.get("traders")
    if isinstance(tc, list) and tc:
        signal = []
        for r in tc:
            if not isinstance(r, dict): continue
            try: val = float(r.get("value"))
            except Exception: continue
            signal.append({"date": str(r.get("date") or ""), "symbol": str(r.get("symbol") or ""), "value": val})
        if signal:
            return {"ok": True, "skill": SKILL, "signal": signal, "series": {"company_vote": signal},
                "metrics": {"bars": len(signal), "source": "tc_signals"},
                "assumptions": ["使用 panels.tc_signals/traders 完整 TC 输出。"],
                "errors": [], "meta": _data_meta("full", ["panels.tc_signals|traders"], [])}
    params = payload.get("params") if isinstance(payload.get("params"), dict) else {}
    fast = int(params.get("fast") or 5)
    slow = int(params.get("slow") or 20)
    mom_n = int(params.get("mom_window") or 10)
    vol_n = int(params.get("vol_window") or 20)
    bars = _pick(payload)
    dates = [b["date"] for b in bars]
    close = [b["close"] for b in bars]
    vol = [b["volume"] for b in bars]
    sym = bars[0]["symbol"]
    rets = _rets(close)
    ma_f = _sma(close, fast)
    ma_s = _sma(close, slow)

    # Trader rules (honest degraded ensemble)
    sig_ma: list[float] = []
    sig_mom: list[float] = []
    sig_volbreak: list[float] = []
    sig_volflow: list[float] = []
    for i in range(len(close)):
        # 1 MA cross
        if ma_f[i] is None or ma_s[i] is None:
            s1 = 0.0
        else:
            s1 = 1.0 if ma_f[i] > ma_s[i] else -1.0
        # 2 momentum
        if i >= mom_n:
            s2 = 1.0 if close[i] >= close[i - mom_n] else -1.0
        else:
            s2 = 0.0
        # 3 return vol breakout vs its mean
        if i + 1 >= vol_n and all(rets[j] is not None for j in range(i + 1 - vol_n, i + 1)):
            chunk = [float(rets[j]) for j in range(i + 1 - vol_n, i + 1)]  # type: ignore[arg-type]
            m = sum(chunk) / vol_n
            sd = math.sqrt(sum((x - m) ** 2 for x in chunk) / max(vol_n - 1, 1))
            last = float(rets[i])  # type: ignore[arg-type]
            if sd > 0 and last > m + 0.5 * sd:
                s3 = 1.0
            elif sd > 0 and last < m - 0.5 * sd:
                s3 = -1.0
            else:
                s3 = 0.0
        else:
            s3 = 0.0
        # 4 volume vs SMA
        if i + 1 >= vol_n:
            vm = sum(vol[i + 1 - vol_n : i + 1]) / vol_n
            s4 = 1.0 if vol[i] >= vm and s2 > 0 else (-1.0 if vol[i] >= vm and s2 < 0 else 0.0)
        else:
            s4 = 0.0
        sig_ma.append(s1)
        sig_mom.append(s2)
        sig_volbreak.append(s3)
        sig_volflow.append(s4)

    # Company aggregate: majority / mean vote → sign
    signal = []
    votes_series = []
    for i, d in enumerate(dates):
        votes = [sig_ma[i], sig_mom[i], sig_volbreak[i], sig_volflow[i]]
        avg = sum(votes) / len(votes)
        if avg > 0.25:
            val = 1.0
        elif avg < -0.25:
            val = -1.0
        else:
            val = 0.0
        signal.append({"date": d, "symbol": sym, "value": val})
        votes_series.append({"date": d, "value": round(avg, 6)})

    return {
        "ok": True,
        "skill": SKILL,
        "signal": signal,
        "series": {
            "trader_ma": [{"date": dates[i], "value": sig_ma[i]} for i in range(len(dates))],
            "trader_mom": [{"date": dates[i], "value": sig_mom[i]} for i in range(len(dates))],
            "trader_volbreak": [{"date": dates[i], "value": sig_volbreak[i]} for i in range(len(dates))],
            "trader_volflow": [{"date": dates[i], "value": sig_volflow[i]} for i in range(len(dates))],
            "company_vote": votes_series,
        },
        "metrics": {
            "bars": len(bars),
            "symbol": sym,
            "traders": 4,
            "last_signal": signal[-1]["value"] if signal else None,
            "last_vote": votes_series[-1]["value"] if votes_series else None,
        },
        "assumptions": [
            "完整 Trader-Company 为随机公式进化 + Company 聚合（需 sklearn 等）；本技能为多规则投票近似。",
            "四名「交易员」：均线交叉、动量、收益波动突破、量能确认；Company=均值投票。",
            "信号为规则状态，非买卖建议。",
        ],
        "errors": [],
        "meta": _data_meta("proxy", ["bars.ohlcv"], ["panels.tc_signals"], reason="rule_ensemble_not_evolutionary_tc"),
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
