#!/usr/bin/env python3
"""股票相关网络度中心性因子（纯 Python） 纯 stdlib。"""
from __future__ import annotations

import argparse
import json
import math
import sys
from collections import defaultdict
from typing import Any

SKILL = "network-centrality-factor"

def _mean(xs: list[float]) -> float:
    return sum(xs) / len(xs) if xs else float("nan")


def _std(xs: list[float]) -> float:
    if len(xs) < 2:
        return float("nan")
    m = _mean(xs)
    var = sum((x - m) ** 2 for x in xs) / (len(xs) - 1)
    return math.sqrt(var) if var > 0 else 0.0


def _zscore_list(xs: list[float]) -> list[float]:
    m, s = _mean(xs), _std(xs)
    if not math.isfinite(s) or s <= 1e-12:
        return [0.0] * len(xs)
    return [(x - m) / s for x in xs]


def _safe_ret(c0: float, c1: float) -> float | None:
    if c0 <= 0 or c1 <= 0:
        return None
    r = c1 / c0 - 1.0
    return r if math.isfinite(r) else None


def _corr(xs: list[float], ys: list[float]) -> float:
    n = min(len(xs), len(ys))
    if n < 3:
        return float("nan")
    x, y = xs[-n:], ys[-n:]
    mx, my = _mean(x), _mean(y)
    num = sum((a - mx) * (b - my) for a, b in zip(x, y))
    denx = math.sqrt(sum((a - mx) ** 2 for a in x))
    deny = math.sqrt(sum((b - my) ** 2 for b in y))
    if denx <= 0 or deny <= 0:
        return float("nan")
    return num / (denx * deny)

def _load_bars(payload: dict[str, Any], need: tuple[str, ...] = ("close",)) -> list[dict[str, Any]]:
    bars = payload.get("bars")
    if not isinstance(bars, list) or not bars:
        raise ValueError("input.bars 须为非空数组")
    out: list[dict[str, Any]] = []
    for b in bars:
        if not isinstance(b, dict):
            continue
        row: dict[str, Any] = {
            "date": str(b.get("date") or ""),
            "symbol": str(b.get("symbol") or ""),
        }
        ok = True
        for k in need:
            try:
                v = float(b[k])
            except (KeyError, TypeError, ValueError):
                ok = False
                break
            if not math.isfinite(v):
                ok = False
                break
            row[k] = v
        if not ok:
            continue
        if "close" in row and row["close"] <= 0:
            continue
        out.append(row)
    if not out:
        raise ValueError("无有效 bars")
    out.sort(key=lambda r: (r["symbol"], r["date"]))
    return out


def _by_symbol(bars: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    d: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for b in bars:
        d[b["symbol"]].append(b)
    return d


def _daily_rets(rows: list[dict[str, Any]]) -> tuple[list[str], list[float]]:
    dates: list[str] = []
    rets: list[float] = []
    for i in range(1, len(rows)):
        r = _safe_ret(rows[i - 1]["close"], rows[i]["close"])
        if r is None:
            continue
        dates.append(rows[i]["date"])
        rets.append(r)
    return dates, rets


def compute(payload: dict[str, Any]) -> dict[str, Any]:
    params = payload.get("params") if isinstance(payload.get("params"), dict) else {}
    window = int(params.get("window") or 60)
    thr = float(params.get("corr_threshold") or 0.3)
    bars = _load_bars(payload, ("close",))
    by = _by_symbol(bars)
    series: dict[str, list[float]] = {}
    asof = ""
    for sym, rows in by.items():
        dates, rets = _daily_rets(rows)
        if len(rets) < window:
            continue
        series[sym] = rets[-window:]
        asof = dates[-1] if dates else asof
    syms = sorted(series.keys())
    if len(syms) < 3:
        raise ValueError("有效标的不足（需 >=3）")
    # Degree centrality: edges where |corr| >= thr
    degree = {s: 0 for s in syms}
    strength = {s: 0.0 for s in syms}
    for i, a in enumerate(syms):
        for b in syms[i + 1 :]:
            c = _corr(series[a], series[b])
            if not math.isfinite(c):
                continue
            if abs(c) >= thr:
                degree[a] += 1
                degree[b] += 1
            strength[a] += abs(c)
            strength[b] += abs(c)
    n = len(syms)
    ranking = []
    for s in syms:
        dc = degree[s] / (n - 1) if n > 1 else 0.0
        ranking.append({
            "symbol": s,
            "date": asof,
            "value": round(dc, 8),
            "degree": degree[s],
            "corr_strength": round(strength[s] / (n - 1), 8) if n > 1 else 0.0,
        })
    ranking.sort(key=lambda x: -x["value"])
    for i, r in enumerate(ranking, start=1):
        r["rank"] = i
    return {
        "ok": True,
        "skill": SKILL,
        "signal": ranking,
        "series": {"ranking": ranking},
        "metrics": {"window": window, "corr_threshold": thr, "universe": n},
        "assumptions": [
            "收益相关网络度中心性；边条件 |corr|>=阈值；纯 Python 无图库。",
            "因子偏「网络枢纽」暴露，非买卖指令。",
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
