#!/usr/bin/env python3
"""球队硬币动量因子（规则版，无 LightGBM） 纯 stdlib。"""
from __future__ import annotations

import argparse
import json
import math
import sys
from collections import defaultdict
from typing import Any

SKILL = "team-coin-momentum"


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


def compute(payload: dict[str, Any]) -> dict[str, Any]:
    panels0 = payload.get("panels") if isinstance(payload.get("panels"), dict) else {}
    params0 = payload.get("params") if isinstance(payload.get("params"), dict) else {}
    ms = panels0.get("ml_scores") or params0.get("model_scores")
    if isinstance(ms, list) and ms:
        ranking = []
        for r in ms:
            if not isinstance(r, dict): continue
            sym = str(r.get("symbol") or "")
            try: val = float(r.get("value") if "value" in r else r.get("score"))
            except Exception: continue
            if not sym or not math.isfinite(val): continue
            ranking.append({"symbol": sym, "date": str(r.get("date") or ""), "value": round(val, 8)})
        if ranking:
            ranking.sort(key=lambda x: -x["value"])
            for i, r in enumerate(ranking, start=1): r["rank"] = i
            return {"ok": True, "skill": SKILL, "signal": ranking, "series": {"ranking": ranking},
                "metrics": {"universe": len(ranking)}, "assumptions": ["使用模型分完整路径。"],
                "errors": [], "meta": _data_meta("full", ["panels.ml_scores|params.model_scores"], [])}
    """
    球队硬币规则版：多窗口动量符号一致性（「球队」）× 动量强度（「硬币」幅度）。
    factor = consistency * mean(|mom_w|) * sign(sum(mom_w))
    """
    params = payload.get("params") if isinstance(payload.get("params"), dict) else {}
    windows = params.get("windows") or [5, 10, 20, 60]
    windows = [int(w) for w in windows]
    bars = _load_bars(payload, ("close",))
    by = _by_symbol(bars)
    ranking: list[dict[str, Any]] = []
    for sym, rows in by.items():
        dates, rets = _daily_rets(rows)
        if len(rets) < max(windows) + 1:
            continue
        moms: list[float] = []
        for w in windows:
            moms.append(sum(rets[-w:]))
        signs = [1 if m > 0 else (-1 if m < 0 else 0) for m in moms]
        nz = [s for s in signs if s != 0]
        if not nz:
            continue
        consistency = abs(sum(nz)) / len(nz)  # 1 = 全同向
        strength = _mean([abs(m) for m in moms])
        direction = 1 if sum(moms) > 0 else (-1 if sum(moms) < 0 else 0)
        value = consistency * strength * direction
        ranking.append({
            "symbol": sym,
            "date": dates[-1] if dates else rows[-1]["date"],
            "value": round(value, 8),
            "consistency": round(consistency, 6),
            "strength": round(strength, 8),
            "moms": {str(w): round(m, 8) for w, m in zip(windows, moms)},
        })
    if not ranking:
        raise ValueError("无标的可算球队硬币")
    ranking.sort(key=lambda x: -x["value"])
    for i, r in enumerate(ranking, start=1):
        r["rank"] = i
    return {
        "ok": True,
        "skill": SKILL,
        "signal": ranking,
        "series": {"ranking": ranking},
        "metrics": {"windows": windows, "universe": len(ranking)},
        "assumptions": [
            "规则版球队硬币：多窗口动量同向一致性×强度；无 LightGBM/TCN。",
            "无模型分时走规则多窗口动量；有 panels.ml_scores 则 full。",
        ],
        "errors": [],
        "meta": _data_meta("proxy", ["bars.daily"], ["panels.ml_scores"], reason="rule_based_no_lightgbm"),
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
