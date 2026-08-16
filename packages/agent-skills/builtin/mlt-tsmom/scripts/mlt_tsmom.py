#!/usr/bin/env python3
"""MLT_TSMOM 规则版多周期时序动量组合 纯 stdlib。"""
from __future__ import annotations

import argparse
import json
import math
import sys
from collections import defaultdict
from typing import Any

SKILL = "mlt-tsmom"


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
    panels = payload.get("panels") if isinstance(payload.get("panels"), dict) else {}
    model_scores = panels.get("ml_scores") or params.get("model_scores")
    if isinstance(model_scores, list) and model_scores:
        ranking = []
        for r in model_scores:
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
            pos = [r for r in ranking if r["value"] > 0] or ranking[: max(1, len(ranking) // 2)]
            raw = [max(1e-9, r["value"]) for r in pos]
            ssum = sum(raw)
            for r in ranking:
                r["weight"] = 0.0
            for r, w in zip(pos, raw):
                r["weight"] = round(w / ssum, 8)
            return {
                "ok": True, "skill": SKILL, "signal": ranking, "series": {"ranking": ranking},
                "metrics": {"universe": len(ranking), "source": "ml_scores"},
                "assumptions": ["使用 panels.ml_scores / params.model_scores 模型分作为 MLT-TSMOM 完整路径。"],
                "errors": [],
                "meta": _data_meta("full", ["panels.ml_scores|params.model_scores"], []),
            }

    horizons = params.get("horizons") or [21, 63, 126]
    horizons = [int(h) for h in horizons]
    vol_w = int(params.get("vol_window") or 63)
    bars = _load_bars(payload, ("close",))
    by = _by_symbol(bars)
    ranking = []
    for sym, rows in by.items():
        dates, rets = _daily_rets(rows)
        need = max(horizons + [vol_w]) + 1
        if len(rets) < need:
            continue
        scores = []
        for h in horizons:
            mom = sum(rets[-h:])
            vol = _std(rets[-vol_w:])
            if not math.isfinite(vol) or vol <= 1e-12:
                continue
            scores.append(mom / vol)
        if not scores:
            continue
        # Multi-task average of vol-scaled TSMOM
        value = _mean(scores)
        ranking.append({
            "symbol": sym,
            "date": dates[-1],
            "value": round(value, 8),
            "horizon_scores": {str(h): round(s, 8) for h, s in zip(horizons, scores)},
        })
    if not ranking:
        raise ValueError("无标的可算 TSMOM")
    ranking.sort(key=lambda x: -x["value"])
    # Equal-risk-ish weights on positive scores
    pos = [r for r in ranking if r["value"] > 0]
    if not pos:
        pos = ranking[: max(1, len(ranking) // 2)]
    raw = [max(1e-9, r["value"]) for r in pos]
    ssum = sum(raw)
    for i, r in enumerate(ranking, start=1):
        r["rank"] = i
        r["weight"] = 0.0
    for r, w in zip(pos, raw):
        r["weight"] = round(w / ssum, 8)
    return {
        "ok": True,
        "skill": SKILL,
        "signal": ranking,
        "series": {"ranking": ranking},
        "metrics": {"horizons": horizons, "vol_window": vol_w, "universe": len(ranking)},
        "assumptions": [
            "MLT_TSMOM 降级为多周期波动缩放时序动量规则平均；无 torch/深度学习。",
            "权重为样本内示意，非实盘。",
        ],
        "errors": [],
        "meta": _data_meta("proxy", ["bars.daily"], ["panels.ml_scores", "params.model_scores"], reason="rule_tsmom_no_deep_learning"),
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
