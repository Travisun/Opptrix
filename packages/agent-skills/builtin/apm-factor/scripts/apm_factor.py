#!/usr/bin/env python3
"""APM 因子（日频 open/close 代理）：隔夜 vs 日间收益差。纯 stdlib。"""
from __future__ import annotations

import argparse
import json
import math
import sys
from collections import defaultdict
from typing import Any


def _mean(xs: list[float]) -> float:
    return sum(xs) / len(xs) if xs else float("nan")


def _std(xs: list[float]) -> float:
    if len(xs) < 2:
        return float("nan")
    m = _mean(xs)
    var = sum((x - m) ** 2 for x in xs) / len(xs)
    return math.sqrt(var) if var > 0 else 0.0


def _safe_log_ret(a: float, b: float) -> float | None:
    if a <= 0 or b <= 0:
        return None
    r = math.log(a / b)
    return r if math.isfinite(r) else None


def _load_bars(payload: dict[str, Any]) -> list[dict[str, Any]]:
    bars = payload.get("bars")
    if not isinstance(bars, list) or not bars:
        raise ValueError("input.bars 须为非空数组（含 open/close）")
    out: list[dict[str, Any]] = []
    for b in bars:
        if not isinstance(b, dict):
            continue
        try:
            o = float(b["open"])
            c = float(b["close"])
        except (KeyError, TypeError, ValueError):
            continue
        if not math.isfinite(o) or not math.isfinite(c) or o <= 0 or c <= 0:
            continue
        out.append(
            {
                "date": str(b.get("date") or ""),
                "symbol": str(b.get("symbol") or ""),
                "open": o,
                "close": c,
            }
        )
    if len(out) < 4:
        raise ValueError("有效 open/close bars 不足")
    out.sort(key=lambda r: (r["symbol"], r["date"]))
    return out


def _ols_resid_vs_market(
    y: list[float], x: list[float]
) -> list[float]:
    """简单一元回归残差：y = a + b x + e。"""
    n = len(y)
    if n < 3 or len(x) != n:
        return y[:]
    mx, my = _mean(x), _mean(y)
    sxx = sum((xi - mx) ** 2 for xi in x)
    if sxx <= 0:
        return [yi - my for yi in y]
    sxy = sum((xi - mx) * (yi - my) for xi, yi in zip(x, y))
    b = sxy / sxx
    a = my - b * mx
    return [yi - (a + b * xi) for yi, xi in zip(y, x)]


def compute(payload: dict[str, Any]) -> dict[str, Any]:
    params = payload.get("params") if isinstance(payload.get("params"), dict) else {}
    window = int(params.get("window") or params.get("max_window") or 20)
    method = str(params.get("method") or "apm_new").lower()
    benchmark = str(params.get("benchmark") or "").strip()
    if window < 5:
        raise ValueError("window 须 >= 5")

    bars = _load_bars(payload)
    by_sym: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for b in bars:
        by_sym[b["symbol"]].append(b)

    # 隔夜 = open_t / close_{t-1}；日间 = close_t / open_t
    per_sym: dict[str, dict[str, Any]] = {}
    for sym, rows in by_sym.items():
        rows = sorted(rows, key=lambda r: r["date"])
        overnight: list[float] = []
        daytime: list[float] = []
        daily: list[float] = []
        dates: list[str] = []
        for i in range(1, len(rows)):
            prev_c = rows[i - 1]["close"]
            o = rows[i]["open"]
            c = rows[i]["close"]
            on = _safe_log_ret(o, prev_c)
            day = _safe_log_ret(c, o)
            dret = _safe_log_ret(c, prev_c)
            if on is None or day is None or dret is None:
                continue
            overnight.append(on)
            daytime.append(day)
            daily.append(dret)
            dates.append(rows[i]["date"])
        if len(overnight) < window:
            continue
        # 取最近 window
        overnight = overnight[-window:]
        daytime = daytime[-window:]
        daily = daily[-window:]
        dates = dates[-window:]
        if method in ("apm_raw", "am_pm"):
            # 日频代理：用「隔夜」近似上午、「日间」近似下午（无分钟线时的降级）
            am, pm = overnight, daytime
        else:
            # apm_new：隔夜 vs 日间
            am, pm = overnight, daytime
        dif = [a - p for a, p in zip(am, pm)]
        sd = _std(dif)
        if not math.isfinite(sd) or sd <= 0:
            continue
        stat = _mean(dif) * math.sqrt(len(dif)) / sd
        per_sym[sym] = {
            "stat": stat,
            "daily_sum": sum(daily),
            "overnight_mean": _mean(overnight),
            "daytime_mean": _mean(daytime),
            "asof": dates[-1] if dates else "",
            "n": len(dif),
        }

    if not per_sym:
        raise ValueError("无标的满足窗口长度，无法计算 APM")

    # 相对基准：若有 benchmark 序列，用其 daily_sum 做截面回归残差；否则用各股自身日收益中性化
    symbols = sorted(per_sym.keys())
    stats = [per_sym[s]["stat"] for s in symbols]
    daily_sums = [per_sym[s]["daily_sum"] for s in symbols]
    if benchmark and benchmark in per_sym and len(symbols) >= 3:
        # 用全样本对日收益回归去趋势
        resid = _ols_resid_vs_market(stats, daily_sums)
    elif len(symbols) >= 3:
        resid = _ols_resid_vs_market(stats, daily_sums)
    else:
        resid = stats[:]

    ranking: list[dict[str, Any]] = []
    for sym, r, st in zip(symbols, resid, stats):
        info = per_sym[sym]
        ranking.append(
            {
                "symbol": sym,
                "date": info["asof"],
                "value": round(r, 8),
                "apm_stat": round(st, 8),
                "overnight_mean": round(info["overnight_mean"], 8),
                "daytime_mean": round(info["daytime_mean"], 8),
                "window": info["n"],
            }
        )
    ranking.sort(key=lambda x: -x["value"])
    for i, row in enumerate(ranking, start=1):
        row["rank"] = i

    assumptions = [
        "方法溯源开源证券 APM：隔夜与盘中收益差的微观结构因子。",
        "本实现为日频 open/close 代理（无 30 分钟线）；apm_new≈隔夜−日间 t 统计量，再对窗口累计收益做截面残差。",
        f"window={window}, method={method}。",
        "因子值为相对强弱截面分数，非买卖指令。",
    ]
    return {
        "ok": True,
        "skill": "apm-factor",
        "signal": ranking,
        "series": {"ranking": ranking},
        "metrics": {
            "window": window,
            "method": method,
            "universe": len(ranking),
            "benchmark": benchmark or None,
        },
        "assumptions": assumptions,
        "errors": [],
    }


def main() -> int:
    ap = argparse.ArgumentParser(description="APM factor (daily proxy)")
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
            "skill": "apm-factor",
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
