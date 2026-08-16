#!/usr/bin/env python3
"""筹码分布因子：日 OHLCV 推演近似（禁止 qlib） 纯 stdlib。"""
from __future__ import annotations

import argparse
import json
import math
import sys
from collections import defaultdict
from typing import Any

SKILL = "chip-distribution-factor"


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
                v = float(b[k] if k in b else b.get(k))
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


def _chip_proxy(rows: list[dict[str, Any]], lookback: int, bins: int) -> dict[str, float] | None:
    """换手衰减加权价格直方图：获利盘比例、筹码集中度、相对成本。"""
    if len(rows) < max(20, lookback // 2):
        return None
    chunk = rows[-lookback:]
    # weight_i ∝ volume * decay
    n = len(chunk)
    hist: dict[int, float] = defaultdict(float)
    prices: list[float] = []
    weights: list[float] = []
    lo = min(r["low"] for r in chunk)
    hi = max(r["high"] for r in chunk)
    if hi <= lo:
        return None
    width = (hi - lo) / bins
    if width <= 0:
        return None
    for i, r in enumerate(chunk):
        decay = 0.97 ** (n - 1 - i)
        vol = max(0.0, float(r.get("volume") or 0.0))
        # 均匀摊到当日 [low, high]
        mid = (r["low"] + r["high"] + r["close"]) / 3.0
        w = (vol + 1.0) * decay
        bi = int((mid - lo) / width)
        bi = max(0, min(bins - 1, bi))
        hist[bi] += w
        prices.append(mid)
        weights.append(w)
    tw = sum(hist.values())
    if tw <= 0:
        return None
    last = chunk[-1]["close"]
    # 获利盘：价格 bin 中心 < last
    profit = 0.0
    cost = 0.0
    for bi, w in hist.items():
        center = lo + (bi + 0.5) * width
        cost += center * w
        if center < last:
            profit += w
    avg_cost = cost / tw
    profit_ratio = profit / tw
    # 集中度：HHI
    hhi = sum((w / tw) ** 2 for w in hist.values())
    # 因子：价格相对成本 + 获利盘适中惩罚极端
    rel = (last / avg_cost - 1.0) if avg_cost > 0 else 0.0
    # 筹码低位集中且未高度获利 → 偏正（示意）
    factor = -rel + 0.5 * (0.5 - abs(profit_ratio - 0.5)) + 0.2 * (1.0 - hhi)
    return {
        "factor": factor,
        "profit_ratio": profit_ratio,
        "avg_cost": avg_cost,
        "concentration_hhi": hhi,
        "rel_to_cost": rel,
    }


def compute(payload: dict[str, Any]) -> dict[str, Any]:
    params = payload.get("params") if isinstance(payload.get("params"), dict) else {}
    panels = payload.get("panels") if isinstance(payload.get("panels"), dict) else {}
    chips = panels.get("chip_distribution")
    if isinstance(chips, list) and chips:
        ranking = []
        for r in chips:
            if not isinstance(r, dict):
                continue
            sym = str(r.get("symbol") or "")
            try:
                val = float(r.get("value") if "value" in r else r.get("factor") if "factor" in r else r.get("profit_ratio"))
            except (TypeError, ValueError, KeyError):
                continue
            if not sym or not math.isfinite(val):
                continue
            row = {"symbol": sym, "date": str(r.get("date") or ""), "value": round(val, 8)}
            for k in ("profit_ratio", "avg_cost", "concentration_hhi", "rel_to_cost"):
                if k in r:
                    try:
                        row[k] = round(float(r[k]), 6)
                    except (TypeError, ValueError):
                        pass
            ranking.append(row)
        if ranking:
            ranking.sort(key=lambda x: -x["value"])
            for i, r in enumerate(ranking, start=1):
                r["rank"] = i
            return {
                "ok": True, "skill": SKILL, "signal": ranking, "series": {"ranking": ranking},
                "metrics": {"universe": len(ranking), "source": "chip_distribution"},
                "assumptions": ["使用 panels.chip_distribution 完整筹码分布因子。"],
                "errors": [],
                "meta": _data_meta("full", ["panels.chip_distribution"], []),
            }

    lookback = int(params.get("lookback") or 60)
    bins = int(params.get("bins") or 20)
    bars = _load_bars(payload, ("open", "high", "low", "close", "volume"))
    by = _by_symbol(bars)
    ranking: list[dict[str, Any]] = []
    for sym, rows in by.items():
        info = _chip_proxy(rows, lookback, bins)
        if not info:
            continue
        ranking.append({
            "symbol": sym,
            "date": rows[-1]["date"],
            "value": round(info["factor"], 8),
            "profit_ratio": round(info["profit_ratio"], 6),
            "avg_cost": round(info["avg_cost"], 6),
            "concentration_hhi": round(info["concentration_hhi"], 6),
            "rel_to_cost": round(info["rel_to_cost"], 6),
        })
    if not ranking:
        raise ValueError("无标的可计算筹码近似")
    ranking.sort(key=lambda x: -x["value"])
    for i, r in enumerate(ranking, start=1):
        r["rank"] = i
    return {
        "ok": True,
        "skill": SKILL,
        "signal": ranking,
        "series": {"ranking": ranking},
        "metrics": {"lookback": lookback, "bins": bins, "universe": len(ranking)},
        "assumptions": [
            "日 OHLCV 推演筹码分布近似（换手衰减直方图），禁止 qlib/cyq_ops。",
            "非真实账户成本分布；因子为示意截面分。",
        ],
        "errors": [],
        "meta": _data_meta("proxy", ["bars.ohlcv"], ["panels.chip_distribution"], reason="ohlcv_chip_proxy_no_qlib"),
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
