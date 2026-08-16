#!/usr/bin/env python3
"""华泰 FFScore / Piotroski 风格财务多维打分。纯 stdlib；读 panels.financials。"""
from __future__ import annotations

import argparse
import json
import math
import sys
from typing import Any


def _f(row: dict[str, Any], *keys: str) -> float | None:
    for k in keys:
        if k not in row or row[k] is None:
            continue
        try:
            v = float(row[k])
        except (TypeError, ValueError):
            continue
        if math.isfinite(v):
            return v
    return None


def _safe_div(a: float | None, b: float | None) -> float | None:
    if a is None or b is None or b == 0:
        return None
    r = a / b
    return r if math.isfinite(r) else None


def _sign_pos(x: float | None) -> int | None:
    if x is None or not math.isfinite(x):
        return None
    return 1 if x > 0 else 0


def _avg2(a: float | None, b: float | None) -> float | None:
    if a is None or b is None:
        return None
    return (a + b) / 2.0


def score_fscore(row: dict[str, Any]) -> tuple[int | None, dict[str, Any], list[str]]:
    """经典 9 维 F-Score（华泰 notebook 口径 + 股权发行按文献：未增发得 1）。"""
    notes: list[str] = []
    roa = _f(row, "roa", "ROA")
    roa_yoy = _f(row, "roa_prev", "roa_4", "roa_yoy", "ROA_PREV")
    total_assets = _f(row, "total_assets", "totalAssets")
    cfo_raw = _f(row, "net_operate_cash_flow", "operatingCashFlow", "operating_cash_flow")
    cfo = _safe_div(cfo_raw, total_assets)
    delta_roa = None
    if roa is not None and roa_yoy is not None and roa_yoy != 0:
        delta_roa = roa / roa_yoy - 1.0
    # ROA 若为百分数，应计盈余 = CFO/Assets - ROA/100
    accrual = None
    if cfo is not None and roa is not None:
        accrual = cfo - (roa * 0.01 if abs(roa) > 1.5 else roa)

    lev = _safe_div(
        _f(row, "total_non_current_liability", "non_current_liability"),
        _f(row, "total_non_current_assets", "non_current_assets"),
    )
    lev_yoy = _safe_div(
        _f(row, "total_non_current_liability_yoy", "total_non_current_liability_4"),
        _f(row, "total_non_current_assets_yoy", "total_non_current_assets_4"),
    )
    delta_lev = None
    if lev is not None and lev_yoy is not None and lev_yoy != 0:
        delta_lev = -(lev / lev_yoy - 1.0)

    liquid = _safe_div(
        _f(row, "total_current_assets", "current_assets"),
        _f(row, "total_current_liability", "current_liability"),
    )
    liquid_yoy = _safe_div(
        _f(row, "total_current_assets_yoy", "total_current_assets_4"),
        _f(row, "total_current_liability_yoy", "total_current_liability_4"),
    )
    delta_liquid = None
    if liquid is not None and liquid_yoy is not None and liquid_yoy != 0:
        delta_liquid = liquid / liquid_yoy - 1.0

    gpm = _f(row, "gross_profit_margin", "grossMargin", "gross_margin")
    gpm_yoy = _f(row, "gross_profit_margin_yoy", "gross_profit_margin_4", "grossMargin_prev")
    delta_margin = None
    if gpm is not None and gpm_yoy is not None and gpm_yoy != 0:
        delta_margin = gpm / gpm_yoy - 1.0

    paid = _f(row, "paidin_capital", "paid_in_capital")
    paid_yoy = _f(row, "paidin_capital_yoy", "paidin_capital_4")
    eq_change = None
    if paid is not None and paid_yoy is not None and paid_yoy != 0:
        eq_change = paid / paid_yoy - 1.0
    # 未增发（股本未上升）得 1
    eq_score = None
    if eq_change is not None:
        eq_score = 1 if eq_change <= 0 else 0
        notes.append("股权发行项按文献：股本未上升得 1（与部分 notebook 符号相反）。")

    rev = _f(row, "operating_revenue", "revenue", "total_operating_revenue")
    rev_yoy = _f(row, "operating_revenue_yoy", "operating_revenue_4", "revenue_yoy")
    ta1 = _f(row, "total_assets_prev_q", "total_assets_1")
    ta4 = _f(row, "total_assets_yoy", "total_assets_4")
    ta5 = _f(row, "total_assets_yoy_prev_q", "total_assets_5")
    turn = _safe_div(rev, _avg2(total_assets, ta1))
    turn_yoy = _safe_div(rev_yoy, _avg2(ta4, ta5))
    delta_turn = None
    if turn is not None and turn_yoy is not None and turn_yoy != 0:
        delta_turn = turn / turn_yoy - 1.0

    comps = {
        "ROA": (1 if roa > 0 else 0) if roa is not None else None,
        "CFO": _sign_pos(cfo),
        "DELTA_ROA": _sign_pos(delta_roa),
        "ACCRUAL": _sign_pos(accrual),
        "DELTA_LEVER": _sign_pos(delta_lev),
        "DELTA_LIQUID": _sign_pos(delta_liquid),
        "DELTA_MARGIN": _sign_pos(delta_margin),
        "DELTA_TURN": _sign_pos(delta_turn),
        "EQ_OFFER": eq_score,
    }

    available = [v for v in comps.values() if v is not None]
    if not available:
        return None, comps, notes + ["无可用 F-Score 字段"]
    return sum(available), comps, notes


def score_ffscore(row: dict[str, Any]) -> tuple[int | None, dict[str, Any], list[str]]:
    """华泰精简 FFScore（5 维）。"""
    notes: list[str] = []
    roe = _f(row, "roe", "ROE")
    roe_yoy = _f(row, "roe_prev", "roe_4", "roe_yoy")
    delta_roe = None
    if roe is not None and roe_yoy is not None and roe_yoy != 0:
        delta_roe = roe / roe_yoy - 1.0

    lev = _safe_div(
        _f(row, "total_non_current_liability", "non_current_liability"),
        _f(row, "total_non_current_assets", "non_current_assets"),
    )
    lev_yoy = _safe_div(
        _f(row, "total_non_current_liability_yoy", "total_non_current_liability_4"),
        _f(row, "total_non_current_assets_yoy", "total_non_current_assets_4"),
    )
    delta_lev = None
    if lev is not None and lev_yoy is not None and lev_yoy != 0:
        delta_lev = -(lev / lev_yoy - 1.0)

    rev = _f(row, "operating_revenue", "revenue")
    rev_yoy = _f(row, "operating_revenue_yoy", "operating_revenue_4", "revenue_yoy")
    ca = _f(row, "total_current_assets", "current_assets")
    ca1 = _f(row, "total_current_assets_prev_q", "total_current_assets_1")
    ca4 = _f(row, "total_current_assets_yoy", "total_current_assets_4")
    ca5 = _f(row, "total_current_assets_yoy_prev_q", "total_current_assets_5")
    caturn = _safe_div(rev, _avg2(ca, ca1))
    caturn_yoy = _safe_div(rev_yoy, _avg2(ca4, ca5))
    delta_caturn = None
    if caturn is not None and caturn_yoy is not None and caturn_yoy != 0:
        delta_caturn = caturn / caturn_yoy - 1.0

    tor = _f(row, "total_operating_revenue", "operating_revenue", "revenue")
    tor_yoy = _f(row, "total_operating_revenue_yoy", "total_operating_revenue_4", "operating_revenue_yoy", "revenue_yoy")
    ta = _f(row, "total_assets", "totalAssets")
    ta1 = _f(row, "total_assets_prev_q", "total_assets_1")
    ta4 = _f(row, "total_assets_yoy", "total_assets_4")
    ta5 = _f(row, "total_assets_yoy_prev_q", "total_assets_5")
    turn = _safe_div(tor, _avg2(ta, ta1))
    turn_yoy = _safe_div(tor_yoy, _avg2(ta4, ta5))
    delta_turn = None
    if turn is not None and turn_yoy is not None and turn_yoy != 0:
        delta_turn = turn / turn_yoy - 1.0

    comps = {
        "ROE": _sign_pos(roe),
        "DELTA_ROE": _sign_pos(delta_roe),
        "DELTA_CATURN": _sign_pos(delta_caturn),
        "DELTA_TURN": _sign_pos(delta_turn),
        "DELTA_LEVER": _sign_pos(delta_lev),
    }
    available = [v for v in comps.values() if v is not None]
    if not available:
        return None, comps, notes + ["无可用 FFScore 字段"]
    return sum(available), comps, notes


def compute(payload: dict[str, Any]) -> dict[str, Any]:
    params = payload.get("params") if isinstance(payload.get("params"), dict) else {}
    mode = str(params.get("mode") or "ffscore").lower().strip()
    if mode not in ("ffscore", "fscore", "both"):
        mode = "ffscore"

    panels = payload.get("panels") if isinstance(payload.get("panels"), dict) else {}
    financials = panels.get("financials")
    if not isinstance(financials, list) or not financials:
        return {
            "ok": False,
            "skill": "ht-ffscore",
            "signal": [],
            "series": {},
            "metrics": {},
            "assumptions": [],
            "errors": ["缺少 panels.financials：请先由 Agent 写入财务面板后再打分"],
        }

    ranking: list[dict[str, Any]] = []
    all_notes: list[str] = []
    skipped = 0

    for row in financials:
        if not isinstance(row, dict):
            skipped += 1
            continue
        symbol = str(row.get("symbol") or row.get("code") or "").strip()
        if not symbol:
            skipped += 1
            continue
        entry: dict[str, Any] = {
            "symbol": symbol,
            "report_date": str(row.get("report_date") or row.get("reportDate") or ""),
        }
        if mode in ("ffscore", "both"):
            sc, comps, notes = score_ffscore(row)
            entry["ffscore"] = sc
            entry["ffscore_components"] = comps
            entry["ffscore_max"] = 5
            all_notes.extend(notes)
        if mode in ("fscore", "both"):
            sc, comps, notes = score_fscore(row)
            entry["fscore"] = sc
            entry["fscore_components"] = comps
            entry["fscore_max"] = 9
            all_notes.extend(notes)

        primary = entry.get("ffscore") if mode != "fscore" else entry.get("fscore")
        if primary is None and mode == "both":
            primary = entry.get("fscore")
        entry["value"] = primary
        if primary is None:
            skipped += 1
            continue
        ranking.append(entry)

    if not ranking:
        return {
            "ok": False,
            "skill": "ht-ffscore",
            "signal": [],
            "series": {},
            "metrics": {"skipped": skipped, "mode": mode},
            "assumptions": [],
            "errors": ["财务面板无有效字段可打分：请补齐 ROE/资产/营收等科目"],
        }

    ranking.sort(key=lambda r: (-(r["value"] if r["value"] is not None else -1), r["symbol"]))
    for i, r in enumerate(ranking, start=1):
        r["rank"] = i

    uniq_notes = list(dict.fromkeys(all_notes))
    assumptions = [
        "方法溯源华泰价值选股 FFScore / 比乔斯基 F-Score；由 Agent 写入的财务面板打分，脚本不联网取数。",
        f"模式 mode={mode}；缺字段的分项跳过，总分按可得项累加。",
        "排序为截面质量/财务改善打分，非荐股。",
    ] + uniq_notes

    return {
        "ok": True,
        "skill": "ht-ffscore",
        "signal": ranking,
        "series": {"ranking": ranking},
        "metrics": {
            "mode": mode,
            "count": len(ranking),
            "skipped": skipped,
            "score_mean": round(sum(r["value"] for r in ranking) / len(ranking), 4),
            "score_max_observed": max(r["value"] for r in ranking),
            "score_min_observed": min(r["value"] for r in ranking),
        },
        "assumptions": assumptions,
        "errors": [],
    }


def main() -> int:
    ap = argparse.ArgumentParser(description="Huatai FFScore / F-Score")
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
            "skill": "ht-ffscore",
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
