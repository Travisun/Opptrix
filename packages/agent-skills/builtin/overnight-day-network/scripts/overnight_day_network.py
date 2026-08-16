#!/usr/bin/env python3
"""隔夜-日间 lead-lag 网络因子（简化，禁 qlib） 纯 stdlib。"""
from __future__ import annotations

import argparse
import json
import math
import sys
from collections import defaultdict
from typing import Any

SKILL = "overnight-day-network"


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


def _on_day(rows: list[dict[str, Any]]) -> tuple[list[float], list[float]]:
    on: list[float] = []
    day: list[float] = []
    for i in range(1, len(rows)):
        prev_c = rows[i - 1]["close"]
        o, c = rows[i]["open"], rows[i]["close"]
        if prev_c <= 0 or o <= 0 or c <= 0:
            continue
        on.append(o / prev_c - 1.0)
        day.append(c / o - 1.0)
    return on, day


def compute(payload: dict[str, Any]) -> dict[str, Any]:
    panels = payload.get("panels") if isinstance(payload.get("panels"), dict) else {}
    net = panels.get("network") or panels.get("lead_lag") or panels.get("clustering")
    if isinstance(net, list) and net:
        ranking = []
        for r in net:
            if not isinstance(r, dict):
                continue
            sym = str(r.get("symbol") or "")
            try:
                val = float(r.get("value") if "value" in r else r.get("score"))
            except (TypeError, ValueError, KeyError):
                continue
            if not sym or not math.isfinite(val):
                continue
            ranking.append({"symbol": sym, "date": str(r.get("date") or ""), "value": round(val, 8)})
        if ranking:
            ranking.sort(key=lambda x: -x["value"])
            for i, r in enumerate(ranking, start=1):
                r["rank"] = i
            return {
                "ok": True, "skill": SKILL, "signal": ranking, "series": {"ranking": ranking},
                "metrics": {"universe": len(ranking), "source": "panels.network"},
                "assumptions": ["使用 panels.network/lead_lag/clustering 完整网络结果。"],
                "errors": [],
                "meta": _data_meta("full", ["panels.network|lead_lag|clustering"], []),
            }
    params = payload.get("params") if isinstance(payload.get("params"), dict) else {}
    window = int(params.get("window") or 40)
    lag = int(params.get("lag") or 1)
    bars = _load_bars(payload, ("open", "close"))
    by = _by_symbol(bars)
    on_s: dict[str, list[float]] = {}
    day_s: dict[str, list[float]] = {}
    asof = ""
    for sym, rows in by.items():
        on, day = _on_day(rows)
        if len(on) < window + lag:
            continue
        on_s[sym] = on[-(window + lag) :]
        day_s[sym] = day[-(window + lag) :]
        asof = rows[-1]["date"]
    syms = sorted(set(on_s) & set(day_s))
    if len(syms) < 2:
        raise ValueError("有效标的不足")
    # lead-lag score: corr(on_i[t-lag], day_j[t]) aggregated; self APM-like on vs day
    ranking = []
    for s in syms:
        on = on_s[s]
        day = day_s[s]
        # self overnight→day lag corr
        x = on[:-lag] if lag else on
        y = day[lag:] if lag else day
        n = min(len(x), len(y), window)
        c_self = _corr(x[-n:], y[-n:])
        # network: average |corr| of this stock's overnight to others' daytime
        links = []
        for t in syms:
            if t == s:
                continue
            xx = on_s[s][:-lag] if lag else on_s[s]
            yy = day_s[t][lag:] if lag else day_s[t]
            nn = min(len(xx), len(yy), window)
            cc = _corr(xx[-nn:], yy[-nn:])
            if math.isfinite(cc):
                links.append(cc)
        net = _mean(links) if links else 0.0
        val = (c_self if math.isfinite(c_self) else 0.0) + 0.5 * net
        ranking.append({
            "symbol": s,
            "date": asof,
            "value": round(val, 8),
            "self_on_to_day": round(c_self, 8) if math.isfinite(c_self) else None,
            "network_on_to_others_day": round(net, 8),
        })
    ranking.sort(key=lambda x: -x["value"])
    for i, r in enumerate(ranking, start=1):
        r["rank"] = i
    return {
        "ok": True,
        "skill": SKILL,
        "signal": ranking,
        "series": {"ranking": ranking},
        "metrics": {"window": window, "lag": lag, "universe": len(ranking)},
        "assumptions": [
            "隔夜→日间 lead-lag 简化版；禁止 qlib；无聚类组合完整回测。",
            "open/close 拆隔夜与日间收益。",
        ],
        "errors": [],
        "meta": _data_meta("proxy", ["bars.ohlcv"], ["panels.network", "panels.clustering"], reason="simplified_lead_lag_no_clustering"),
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
