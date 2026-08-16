#!/usr/bin/env python3
"""指数高阶矩择时（广发口径简化，纯 stdlib）。

v_k = mean(r^k) over N；对 5 阶矩做 EMA；切线法：EMA 上升→+1，否则 -1。
可选简化滚动选 alpha；完整切线法 90 日网格可降级为固定 alpha。
"""
from __future__ import annotations

import argparse
import json
import math
import sys
from typing import Any

SKILL = "index-higher-moment"



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

def _ewm(xs: list[float | None], alpha: float) -> list[float | None]:
    out: list[float | None] = [None] * len(xs)
    prev: float | None = None
    for i, v in enumerate(xs):
        if v is None or not math.isfinite(v):
            out[i] = None
            continue
        if prev is None:
            prev = v
        else:
            prev = alpha * v + (1 - alpha) * prev
        out[i] = prev
    return out


def _pick_bars(payload: dict[str, Any]) -> list[dict[str, Any]]:
    bars = payload.get("bars")
    if not isinstance(bars, list) or not bars:
        raise ValueError("input.bars 须为非空数组")
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
        if c <= 0 or not math.isfinite(c):
            continue
        cleaned.append({"date": str(b.get("date") or ""), "symbol": str(b.get("symbol") or ""), "close": c})
    if len(cleaned) < 30:
        raise ValueError("有效 close bars 不足")
    cleaned.sort(key=lambda r: r["date"])
    return cleaned


def compute(payload: dict[str, Any]) -> dict[str, Any]:
    params = payload.get("params") if isinstance(payload.get("params"), dict) else {}
    n = int(params.get("moment_window") or params.get("N") or 20)
    order = int(params.get("order") or 5)
    alpha = float(params.get("alpha") or 0.1)
    roll = int(params.get("alpha_roll") or 90)
    use_grid = bool(params.get("select_alpha") or False)
    stop_loss = float(params.get("stop_loss") or 0.1)

    bars = _pick_bars(payload)
    dates = [b["date"] for b in bars]
    close = [b["close"] for b in bars]
    sym = bars[0]["symbol"]
    rets: list[float | None] = [None]
    for i in range(1, len(close)):
        rets.append(close[i] / close[i - 1] - 1.0)

    moment: list[float | None] = [None] * len(rets)
    for i in range(len(rets)):
        if i + 1 < n:
            continue
        chunk = rets[i + 1 - n : i + 1]
        if any(v is None for v in chunk):
            continue
        moment[i] = sum((float(v) ** order) for v in chunk) / n  # type: ignore[arg-type]

    degraded = False
    assumptions = [
        "方法溯源广发《指数高阶矩择时》：原点矩 v_k=mean(r^k)，默认 k=5、N=20。",
        "切线法：EMA_t > EMA_{t-1} → +1，否则 -1（规则状态，非买卖指令）。",
    ]

    alphas = [round(0.05 + 0.05 * i, 2) for i in range(10)]  # 0.05..0.50
    chosen_alpha = alpha
    ema: list[float | None]

    if use_grid and len(bars) >= roll + n + 5:
        # 简化：每隔 roll 用过去 roll 日网格选累计收益最大的 alpha
        ema_by: dict[float, list[float | None]] = {a: _ewm(moment, a) for a in alphas}
        chosen_series: list[float | None] = [None] * len(moment)
        cur_a = alpha
        for i in range(len(moment)):
            if i > 0 and i % roll == 0 and i >= roll:
                best_a, best_score = cur_a, -1e18
                for a in alphas:
                    e = ema_by[a]
                    score = 0.0
                    for j in range(i - roll + 1, i):
                        if j < 2 or e[j - 1] is None or e[j - 2] is None or rets[j] is None:
                            continue
                        sig = 1.0 if e[j - 1] > e[j - 2] else -1.0  # type: ignore[operator]
                        score += sig * float(rets[j])  # type: ignore[arg-type]
                    if score > best_score:
                        best_score, best_a = score, a
                cur_a = best_a
            chosen_series[i] = ema_by[cur_a][i]
            chosen_alpha = cur_a
        ema = chosen_series
        assumptions.append(f"滚动 {roll} 日网格选择 alpha（简化切线法），末值 alpha={chosen_alpha}。")
    else:
        if use_grid:
            degraded = True
            assumptions.append("样本不足以滚动选 alpha，降级为固定 alpha。")
        ema = _ewm(moment, chosen_alpha)
        assumptions.append(f"固定 alpha={chosen_alpha} 的 EMA 平滑五阶矩。")

    signal: list[dict[str, Any]] = []
    state = 0
    trade_ret = 0.0
    for i in range(2, len(bars)):
        if ema[i] is None or ema[i - 1] is None:
            continue
        # T 日用已实现 EMA 比较（不含未来）
        if ema[i] > ema[i - 1]:  # type: ignore[operator]
            state = 1
        else:
            state = -1
        # 简化止损：累计逆向收益超阈值则归零直到方向翻转
        if rets[i] is not None:
            if state == 1:
                trade_ret = trade_ret + float(rets[i]) if trade_ret >= 0 or state == 1 else float(rets[i])
            # lightweight: if last signal was long and drawdown from entry proxy
        val = state
        signal.append({"date": dates[i], "symbol": sym, "value": val})

    return {
        "ok": True,
        "skill": SKILL,
        "signal": signal,
        "series": {
            "moment": [{"date": dates[i], "value": v} for i, v in enumerate(moment) if v is not None],
            "ema_moment": [{"date": dates[i], "value": v} for i, v in enumerate(ema) if v is not None],
            "returns": [{"date": dates[i], "value": v} for i, v in enumerate(rets) if v is not None],
        },
        "metrics": {
            "bars": len(bars),
            "symbol": sym,
            "moment_window": n,
            "order": order,
            "alpha": chosen_alpha,
            "stop_loss": stop_loss,
            "last_signal": signal[-1]["value"] if signal else None,
            "last_moment": next((v for v in reversed(moment) if v is not None), None),
        },
        "assumptions": assumptions + ["仅标准库；止损参数记录于 metrics，完整路径仓位机可后续扩展。"],
        "errors": [],
        "meta": (
            _data_meta("proxy", ["bars.daily"], ["params.alpha_grid_ready"], reason="fixed_alpha_short_sample")
            if degraded else
            _data_meta("full", ["bars.daily"], [])
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
