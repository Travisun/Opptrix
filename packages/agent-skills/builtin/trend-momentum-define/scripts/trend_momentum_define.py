#!/usr/bin/env python3
"""趋与势量化定义（国泰君安口径简化，纯 stdlib）。

标准化状态：融合收盘价单调性与均线；趋=波段位移和，势=波段长度平方和。
"""
from __future__ import annotations

import argparse
import json
import sys
from typing import Any

SKILL = "trend-momentum-define"


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


def _fused_state(close: list[float], ma: list[float | None]) -> list[int]:
    """融合单调性与均线的状态变化向量 ∈ {-1,0,1}。"""
    n = len(close)
    st = [0] * n
    for i in range(1, n):
        if ma[i] is None or ma[i - 1] is None:
            continue
        above = close[i] >= ma[i]
        prev_above = close[i - 1] >= ma[i - 1]
        up = close[i] >= close[i - 1]
        if (not prev_above) and above:
            st[i] = 1
        elif prev_above and (not above):
            st[i] = -1
        elif above and prev_above:
            st[i] = 1 if up else 0
        else:
            st[i] = 0 if up else -1
    return st


def _displacement(states: list[int]) -> list[int]:
    """位移向量：起点 0，其后累加状态。"""
    d = [0]
    for s in states[1:]:
        d.append(d[-1] + s)
    return d


def _segments(disp: list[int]) -> list[int]:
    """连续同向波段长度序列（拐点分割）。"""
    if len(disp) < 2:
        return []
    diffs = [disp[i] - disp[i - 1] for i in range(1, len(disp))]
    segs: list[int] = []
    cur_sign = 0
    cur_len = 0
    for d in diffs:
        sgn = 1 if d > 0 else (-1 if d < 0 else 0)
        if sgn == 0:
            continue
        if cur_sign == 0:
            cur_sign = sgn
            cur_len = 1
        elif sgn == cur_sign:
            cur_len += 1
        else:
            segs.append(cur_len * cur_sign)
            cur_sign = sgn
            cur_len = 1
    if cur_len and cur_sign:
        segs.append(cur_len * cur_sign)
    return segs


def _pick_bars(payload: dict[str, Any]) -> list[dict[str, Any]]:
    bars = payload.get("bars")
    if not isinstance(bars, list) or not bars:
        raise ValueError("input.bars 须为非空数组")
    symbol = None
    params = payload.get("params") if isinstance(payload.get("params"), dict) else {}
    symbol = params.get("symbol")
    rows = [b for b in bars if isinstance(b, dict)]
    if symbol:
        filt = [b for b in rows if str(b.get("symbol", "")) == str(symbol)]
        if filt:
            rows = filt
    cleaned = []
    for b in rows:
        try:
            c = float(b["close"])
        except (KeyError, TypeError, ValueError):
            continue
        if c <= 0:
            continue
        cleaned.append({"date": str(b.get("date") or ""), "symbol": str(b.get("symbol") or ""), "close": c})
    if len(cleaned) < 10:
        raise ValueError("有效 close bars 不足")
    cleaned.sort(key=lambda r: r["date"])
    return cleaned


def compute(payload: dict[str, Any]) -> dict[str, Any]:
    params = payload.get("params") if isinstance(payload.get("params"), dict) else {}
    window = int(params.get("window") or params.get("ma_window") or 5)
    lookback = int(params.get("lookback") or 60)
    bars = _pick_bars(payload)
    dates = [b["date"] for b in bars]
    close = [b["close"] for b in bars]
    sym = bars[0]["symbol"]
    ma = _sma(close, window)
    states = _fused_state(close, ma)
    disp = _displacement(states)

    signal: list[dict[str, Any]] = []
    qu_series: list[dict[str, Any]] = []
    shi_series: list[dict[str, Any]] = []
    for i in range(len(bars)):
        if i + 1 < lookback or ma[i] is None:
            continue
        start = i + 1 - lookback
        segs = _segments(disp[start : i + 1])
        qu = sum(segs)
        shi = sum(s * s for s in segs)
        direction = 1 if qu > 0 else (-1 if qu < 0 else 0)
        # 势大且趋明确 → 强化方向；势小 → 0（震荡）
        strength = abs(shi)
        thr = max(lookback // 4, 4)
        val = direction if strength >= thr else 0
        signal.append({"date": dates[i], "symbol": sym, "value": val, "qu": qu, "shi": shi})
        qu_series.append({"date": dates[i], "value": qu})
        shi_series.append({"date": dates[i], "value": shi})

    last = signal[-1] if signal else None
    return {
        "ok": True,
        "skill": SKILL,
        "signal": signal,
        "series": {
            "state": [{"date": dates[i], "value": states[i]} for i in range(len(dates)) if ma[i] is not None],
            "displacement": [{"date": dates[i], "value": disp[i]} for i in range(len(dates))],
            "qu": qu_series,
            "shi": shi_series,
            "ma": [{"date": dates[i], "value": round(v, 6)} for i, v in enumerate(ma) if v is not None],
        },
        "metrics": {
            "bars": len(bars),
            "symbol": sym,
            "ma_window": window,
            "lookback": lookback,
            "last_qu": None if last is None else last["qu"],
            "last_shi": None if last is None else last["shi"],
            "last_signal": None if last is None else last["value"],
        },
        "assumptions": [
            "方法溯源国泰君安《趋与势的量化定义》：融合单调性与均线标准化，趋=Σd_i，势=Σd_i²。",
            "信号为规则状态（非买卖指令）；势低于阈值视为震荡归零。",
            "仅 Python 标准库；仅 Python 标准库，自包含。",
        ],
        "errors": [],
        "meta": {"degraded": False},
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
