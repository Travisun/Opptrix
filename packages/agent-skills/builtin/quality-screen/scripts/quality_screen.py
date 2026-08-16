#!/usr/bin/env python3
"""Quality screen: 7 hard filters + 3 exemptions. Stdlib only; no network.

Agent path:
  python3 scripts/quality_screen.py --input panels.json --output result.json

Input (either shape)::

  {
    "meta": {"skill": "quality-screen"},
    "instruments": [ { "symbol", "name", "metrics": {...}, ... } ],
    "panels": { "financials": [ { "symbol", ...series fields... } ] }
  }

``panels.financials`` rows are normalized into metrics when ``instruments``
is empty or incomplete. Decision arithmetic uses decimal.Decimal.
"""
from __future__ import annotations

import argparse
import json
import sys
from decimal import Decimal, InvalidOperation
from typing import Any

SKILL = "quality-screen"

# Thresholds (Decimal)
ROE_MIN = Decimal("0.08")
FCF_MIN = Decimal("0")  # 5y cumulative must be > 0 (strictly non-negative fail if < 0)
INTEREST_COV_MIN = Decimal("2")
GROSS_MARGIN_MIN = Decimal("0.15")
OCF_NI_MIN = Decimal("0.7")
NET_MARGIN_MIN = Decimal("0.05")
DILUTION_MAX = Decimal("0.20")  # > 20% non-M&A fails

EXEMPT_A_GROSS = Decimal("0.30")
EXEMPT_B_GROSS = Decimal("0.30")
EXEMPT_C_ROE = Decimal("0.20")
EXEMPT_C_OCF_NI = Decimal("1.0")


def D(v: Any) -> Decimal | None:
    if v is None or v == "":
        return None
    try:
        return Decimal(str(v))
    except (InvalidOperation, ValueError, TypeError):
        return None


def _data_meta(
    data_mode: str,
    used: list[str],
    missing: list[str] | None = None,
    **extra: Any,
) -> dict[str, Any]:
    mode = data_mode if data_mode in ("full", "proxy", "insufficient") else "proxy"
    out: dict[str, Any] = {
        "data_mode": mode,
        "degraded": mode == "proxy",
        "used_inputs": list(used),
        "missing_for_full": list(missing or []),
    }
    out.update(extra)
    return out


def _mean(xs: list[Decimal]) -> Decimal | None:
    if not xs:
        return None
    return sum(xs, Decimal("0")) / Decimal(len(xs))


def _series_mean(raw: Any, keys: tuple[str, ...] = ("value", "roe", "ratio", "margin")) -> Decimal | None:
    if isinstance(raw, (int, float, str, Decimal)):
        return D(raw)
    if not isinstance(raw, list) or not raw:
        return None
    vals: list[Decimal] = []
    for item in raw:
        if isinstance(item, (int, float, str, Decimal)):
            d = D(item)
            if d is not None:
                vals.append(d)
            continue
        if isinstance(item, dict):
            for k in keys:
                if k in item:
                    d = D(item.get(k))
                    if d is not None:
                        vals.append(d)
                        break
    return _mean(vals)


def _pick(d: dict[str, Any], *names: str) -> Any:
    for n in names:
        if n in d and d[n] is not None:
            return d[n]
    return None


def normalize_metrics(row: dict[str, Any]) -> dict[str, Any]:
    """Build metrics dict from instrument.metrics or panels.financials row."""
    m = row.get("metrics") if isinstance(row.get("metrics"), dict) else {}
    src = {**row, **m}

    roe_avg = D(_pick(src, "roe_10y_avg", "roe_avg", "avg_roe"))
    if roe_avg is None:
        roe_avg = _series_mean(_pick(src, "roe_series", "roe_10y", "roe"), ("value", "roe", "ratio"))

    fcf_cum = D(_pick(src, "fcf_5y_cumulative", "fcf_5y_sum", "fcf_cumulative_5y"))
    if fcf_cum is None:
        series = _pick(src, "fcf_series", "fcf_5y", "free_cash_flow")
        if isinstance(series, list) and series:
            vals = []
            for item in series:
                if isinstance(item, dict):
                    vals.append(D(_pick(item, "value", "fcf", "free_cash_flow")))
                else:
                    vals.append(D(item))
            known = [v for v in vals if v is not None]
            if known:
                fcf_cum = sum(known, Decimal("0"))

    interest = D(_pick(src, "interest_coverage", "ebit_interest", "interest_cover"))
    gross = D(_pick(src, "gross_margin_long", "gross_margin", "avg_gross_margin"))
    if gross is None:
        gross = _series_mean(_pick(src, "gross_margin_series", "gross_margins"), ("value", "margin", "gross_margin"))

    ocf_ni = D(_pick(src, "ocf_ni_5y_avg", "ocf_to_ni", "ocf_ni_avg"))
    if ocf_ni is None:
        ocf_ni = _series_mean(_pick(src, "ocf_ni_series"), ("value", "ratio", "ocf_ni"))

    net_m = D(_pick(src, "net_margin_long", "net_margin", "avg_net_margin"))
    if net_m is None:
        net_m = _series_mean(_pick(src, "net_margin_series", "net_margins"), ("value", "margin", "net_margin"))

    dilution = D(_pick(src, "share_dilution_5y", "dilution_5y", "shares_growth_5y"))
    if dilution is None:
        shares_now = D(_pick(src, "shares_now", "shares_outstanding", "total_shares"))
        shares_5y = D(_pick(src, "shares_5y_ago", "shares_then"))
        if shares_now is not None and shares_5y is not None and shares_5y != 0:
            dilution = (shares_now - shares_5y) / shares_5y

    return {
        "roe_10y_avg": roe_avg,
        "fcf_5y_cumulative": fcf_cum,
        "interest_coverage": interest,
        "gross_margin_long": gross,
        "ocf_ni_5y_avg": ocf_ni,
        "net_margin_long": net_m,
        "share_dilution_5y": dilution,
        "years_listed": D(_pick(src, "years_listed", "listing_years")),
        "gross_margin_gt_30": bool(_pick(src, "gross_margin_gt_30"))
        if "gross_margin_gt_30" in src or "gross_margin_gt_30" in m
        else (gross is not None and gross > EXEMPT_A_GROSS),
        "ocf_positive_last_2y": bool(_pick(src, "ocf_positive_last_2y", "ocf_pos_2y"))
        if ("ocf_positive_last_2y" in src or "ocf_pos_2y" in src)
        else None,
        "net_margin_recent_gte_5": bool(_pick(src, "net_margin_recent_gte_5"))
        if "net_margin_recent_gte_5" in src
        else None,
        "net_margin_recent_2y_rising": bool(_pick(src, "net_margin_recent_2y_rising", "net_margin_rising"))
        if ("net_margin_recent_2y_rising" in src or "net_margin_rising" in src)
        else None,
        "roe_current": D(_pick(src, "roe_current", "roe_latest", "roe")),
        "dilution_is_ma": bool(_pick(src, "dilution_is_ma", "share_growth_from_ma")),
        "business_model": str(_pick(src, "business_model", "model_type") or ""),
        "is_bank_or_insurance": bool(
            _pick(src, "is_bank_or_insurance", "bank_or_insurance")
            or str(_pick(src, "sector", "industry") or "").lower()
            in ("bank", "insurance", "banking", "银行", "保险")
        ),
        "is_reit": bool(_pick(src, "is_reit") or "reit" in str(_pick(src, "sector", "") or "").lower()),
        "window_short": bool(_pick(src, "window_short", "data_window_short")),
    }


def _status_pass() -> str:
    return "pass"


def _status_fail() -> str:
    return "fail"


def _status_border() -> str:
    return "border"


def _status_skip() -> str:
    return "skip"


def _status_insufficient() -> str:
    return "insufficient"


def evaluate_instrument(row: dict[str, Any]) -> dict[str, Any]:
    symbol = str(row.get("symbol") or row.get("code") or "")
    name = str(row.get("name") or "")
    metrics = normalize_metrics(row)
    checks: list[dict[str, Any]] = []
    exemptions_used: list[str] = []
    missing_fields: list[str] = []

    # 1 ROE
    roe = metrics["roe_10y_avg"]
    if roe is None:
        missing_fields.append("roe_10y_avg")
        c1 = {"id": 1, "name": "roe_10y_avg", "status": _status_insufficient(), "value": None}
    elif roe < ROE_MIN:
        # Exemption A
        years = metrics["years_listed"]
        ok_a = (
            years is not None
            and years < Decimal("10")
            and metrics["gross_margin_gt_30"]
            and metrics["ocf_positive_last_2y"] is True
        )
        if ok_a:
            exemptions_used.append("A")
            c1 = {
                "id": 1,
                "name": "roe_10y_avg",
                "status": "exempt_pass",
                "value": str(roe),
                "exemption": "A",
            }
        else:
            c1 = {"id": 1, "name": "roe_10y_avg", "status": _status_fail(), "value": str(roe)}
    else:
        # border if near 8%
        near = abs(roe - ROE_MIN) < Decimal("0.005")
        c1 = {
            "id": 1,
            "name": "roe_10y_avg",
            "status": _status_border() if near else _status_pass(),
            "value": str(roe),
        }
    checks.append(c1)

    # 2 FCF 5y cumulative
    fcf = metrics["fcf_5y_cumulative"]
    if fcf is None:
        missing_fields.append("fcf_5y_cumulative")
        c2 = {"id": 2, "name": "fcf_5y_cumulative", "status": _status_insufficient(), "value": None}
    elif fcf < FCF_MIN:
        c2 = {"id": 2, "name": "fcf_5y_cumulative", "status": _status_fail(), "value": str(fcf)}
    else:
        c2 = {"id": 2, "name": "fcf_5y_cumulative", "status": _status_pass(), "value": str(fcf)}
    checks.append(c2)

    # 3 Interest coverage
    if metrics["is_bank_or_insurance"]:
        c3 = {
            "id": 3,
            "name": "interest_coverage",
            "status": _status_skip(),
            "value": None,
            "note": "bank_insurance_na",
        }
    else:
        ic = metrics["interest_coverage"]
        if ic is None:
            missing_fields.append("interest_coverage")
            c3 = {"id": 3, "name": "interest_coverage", "status": _status_insufficient(), "value": None}
        elif ic < INTEREST_COV_MIN:
            c3 = {"id": 3, "name": "interest_coverage", "status": _status_fail(), "value": str(ic)}
        else:
            near = abs(ic - INTEREST_COV_MIN) < Decimal("0.2")
            c3 = {
                "id": 3,
                "name": "interest_coverage",
                "status": _status_border() if near else _status_pass(),
                "value": str(ic),
            }
    checks.append(c3)

    # 4 Gross margin
    gm = metrics["gross_margin_long"]
    if gm is None:
        missing_fields.append("gross_margin_long")
        c4 = {"id": 4, "name": "gross_margin_long", "status": _status_insufficient(), "value": None}
    elif gm < GROSS_MARGIN_MIN:
        # Exemption C may cover later with net margin
        c4 = {"id": 4, "name": "gross_margin_long", "status": _status_fail(), "value": str(gm)}
    else:
        near = abs(gm - GROSS_MARGIN_MIN) < Decimal("0.01")
        c4 = {
            "id": 4,
            "name": "gross_margin_long",
            "status": _status_border() if near else _status_pass(),
            "value": str(gm),
        }
    checks.append(c4)

    # 5 OCF/NI
    ocf_ni = metrics["ocf_ni_5y_avg"]
    if ocf_ni is None:
        missing_fields.append("ocf_ni_5y_avg")
        c5 = {"id": 5, "name": "ocf_ni_5y_avg", "status": _status_insufficient(), "value": None}
    elif ocf_ni < OCF_NI_MIN:
        c5 = {"id": 5, "name": "ocf_ni_5y_avg", "status": _status_fail(), "value": str(ocf_ni)}
    else:
        near = abs(ocf_ni - OCF_NI_MIN) < Decimal("0.05")
        c5 = {
            "id": 5,
            "name": "ocf_ni_5y_avg",
            "status": _status_border() if near else _status_pass(),
            "value": str(ocf_ni),
        }
    checks.append(c5)

    # 6 Net margin
    nm = metrics["net_margin_long"]
    if nm is None:
        missing_fields.append("net_margin_long")
        c6 = {"id": 6, "name": "net_margin_long", "status": _status_insufficient(), "value": None}
    elif nm < NET_MARGIN_MIN:
        # Exemption B
        ok_b = metrics["gross_margin_gt_30"] and (
            metrics["net_margin_recent_gte_5"] is True or metrics["net_margin_recent_2y_rising"] is True
        )
        if ok_b:
            exemptions_used.append("B")
            c6 = {
                "id": 6,
                "name": "net_margin_long",
                "status": "exempt_pass",
                "value": str(nm),
                "exemption": "B",
            }
        else:
            c6 = {"id": 6, "name": "net_margin_long", "status": _status_fail(), "value": str(nm)}
    else:
        near = abs(nm - NET_MARGIN_MIN) < Decimal("0.005")
        c6 = {
            "id": 6,
            "name": "net_margin_long",
            "status": _status_border() if near else _status_pass(),
            "value": str(nm),
        }
    checks.append(c6)

    # Exemption C: high-turnover thin margin — can rescue fail on 4 and/or 6
    roe_cur = metrics["roe_current"] if metrics["roe_current"] is not None else roe
    model = (metrics["business_model"] or "").lower()
    thin_models = ("membership", "platform", "high_turnover", "会员", "平台", "高周转", "costco", "thin")
    model_ok = any(t in model for t in thin_models) if model else False
    # Allow Agent to set business_model flag explicitly via metrics
    if bool(row.get("high_turnover_thin_margin") or metrics.get("high_turnover_thin_margin")):
        model_ok = True
    ok_c = (
        roe_cur is not None
        and roe_cur > EXEMPT_C_ROE
        and ocf_ni is not None
        and ocf_ni > EXEMPT_C_OCF_NI
        and model_ok
    )
    if ok_c:
        for i, c in enumerate(checks):
            if c["id"] in (4, 6) and c["status"] == _status_fail():
                checks[i] = {
                    **c,
                    "status": "exempt_pass",
                    "exemption": "C",
                }
                if "C" not in exemptions_used:
                    exemptions_used.append("C")

    # 7 Dilution
    dil = metrics["share_dilution_5y"]
    if dil is None:
        missing_fields.append("share_dilution_5y")
        c7 = {"id": 7, "name": "share_dilution_5y", "status": _status_insufficient(), "value": None}
    elif dil > DILUTION_MAX and not metrics["dilution_is_ma"]:
        c7 = {"id": 7, "name": "share_dilution_5y", "status": _status_fail(), "value": str(dil)}
    else:
        c7 = {
            "id": 7,
            "name": "share_dilution_5y",
            "status": _status_pass(),
            "value": str(dil),
            "note": "ma_exempt" if metrics["dilution_is_ma"] and dil > DILUTION_MAX else None,
        }
    checks.append(c7)

    hard_fail = [c for c in checks if c["status"] == _status_fail()]
    insuff = [c for c in checks if c["status"] == _status_insufficient()]
    if hard_fail:
        result = "exclude"
    elif insuff and len(insuff) >= 3:
        result = "insufficient"
    elif insuff:
        result = "partial"
    elif any(c["status"] == "exempt_pass" for c in checks):
        result = "exempt_pass"
    else:
        result = "pass"

    return {
        "symbol": symbol,
        "name": name,
        "result": result,
        "checks": checks,
        "exemptions": exemptions_used,
        "missing_fields": missing_fields,
        "window_short": bool(metrics["window_short"]),
        "is_bank_or_insurance": bool(metrics["is_bank_or_insurance"]),
    }


def collect_rows(payload: dict[str, Any]) -> tuple[list[dict[str, Any]], list[str], list[str]]:
    used: list[str] = []
    missing: list[str] = []
    rows: list[dict[str, Any]] = []

    instruments = payload.get("instruments")
    if isinstance(instruments, list) and instruments:
        used.append("instruments")
        rows.extend([r for r in instruments if isinstance(r, dict)])

    panels = payload.get("panels") if isinstance(payload.get("panels"), dict) else {}
    financials = panels.get("financials")
    if isinstance(financials, list) and financials:
        used.append("panels.financials")
        # Merge by symbol if instruments already present
        by_sym = {str(r.get("symbol") or r.get("code") or ""): r for r in rows}
        for fr in financials:
            if not isinstance(fr, dict):
                continue
            sym = str(fr.get("symbol") or fr.get("code") or "")
            if sym and sym in by_sym:
                merged = {**fr, **by_sym[sym]}
                # prefer explicit metrics from instruments
                if isinstance(by_sym[sym].get("metrics"), dict):
                    merged["metrics"] = {**(fr.get("metrics") or {}), **by_sym[sym]["metrics"]}
                by_sym[sym] = merged
            else:
                by_sym[sym or f"_anon_{len(by_sym)}"] = fr
        rows = list(by_sym.values())

    # Also accept top-level financials alias
    top_fin = payload.get("financials")
    if isinstance(top_fin, list) and top_fin and "panels.financials" not in used:
        used.append("financials")
        for fr in top_fin:
            if isinstance(fr, dict):
                rows.append(fr)

    if not rows:
        missing.extend(["instruments", "panels.financials"])
    return rows, used, missing


def detect_mode(rows: list[dict[str, Any]], used: list[str]) -> tuple[str, list[str], list[str]]:
    """full: enough fields to decide all 7 for every row; proxy: partial; insufficient: none."""
    if not rows:
        return "insufficient", used, ["instruments|panels.financials"]

    required = (
        "roe_10y_avg",
        "fcf_5y_cumulative",
        "interest_coverage",
        "gross_margin_long",
        "ocf_ni_5y_avg",
        "net_margin_long",
        "share_dilution_5y",
    )
    missing_global: list[str] = []
    full_count = 0
    for r in rows:
        m = normalize_metrics(r)
        miss = [k for k in required if m.get(k) is None]
        # bank skip interest
        if m.get("is_bank_or_insurance") and "interest_coverage" in miss:
            miss = [x for x in miss if x != "interest_coverage"]
        if not miss:
            full_count += 1
        else:
            for x in miss:
                key = f"metrics.{x}"
                if key not in missing_global:
                    missing_global.append(key)

    if full_count == len(rows):
        return "full", used, []
    if full_count > 0 or any(
        normalize_metrics(r).get(k) is not None for r in rows for k in required
    ):
        return "proxy", used, missing_global
    return "insufficient", used, missing_global or ["metrics.*"]


def run(payload: dict[str, Any]) -> dict[str, Any]:
    rows, used, miss_collect = collect_rows(payload)
    mode, used2, missing = detect_mode(rows, used)
    if miss_collect and mode == "insufficient":
        missing = list(dict.fromkeys(missing + miss_collect))

    if not rows:
        return {
            "ok": False,
            "skill": SKILL,
            "meta": _data_meta("insufficient", used2, missing),
            "checks": [],
            "metrics": {"n": 0, "pass": 0, "exclude": 0, "exempt_pass": 0, "partial": 0, "insufficient": 0},
            "results": [],
            "assumptions": ["无标的输入：需要 instruments[] 或 panels.financials"],
            "errors": ["empty_universe"],
        }

    results = [evaluate_instrument(r) for r in rows]
    counts = {
        "n": len(results),
        "pass": sum(1 for r in results if r["result"] == "pass"),
        "exclude": sum(1 for r in results if r["result"] == "exclude"),
        "exempt_pass": sum(1 for r in results if r["result"] == "exempt_pass"),
        "partial": sum(1 for r in results if r["result"] == "partial"),
        "insufficient": sum(1 for r in results if r["result"] == "insufficient"),
    }
    assumptions = [
        "7 硬指标：宁可漏网不可误杀；通过≠一流，仅排除确定非一流",
        "银行/保险跳过利息覆盖；并购导致稀释可标 dilution_is_ma",
        "豁免 A/B/C 见 skill 说明；豁免 C 需标明高周转薄利商业模式",
    ]
    if mode == "proxy":
        assumptions.append("部分字段缺失：按可得指标打分，缺失项标 insufficient，不伪装全过")

    ok = mode != "insufficient"
    return {
        "ok": ok,
        "skill": SKILL,
        "meta": _data_meta(mode, used2, missing),
        "checks": [],
        "metrics": counts,
        "results": results,
        "assumptions": assumptions,
        "errors": [] if ok else ["insufficient_metrics"],
    }


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=SKILL)
    ap.add_argument("--input", required=True)
    ap.add_argument("--output")
    args = ap.parse_args(argv)
    try:
        with open(args.input, encoding="utf-8") as f:
            payload = json.load(f)
        if not isinstance(payload, dict):
            raise ValueError("input 须为 JSON 对象")
        result = run(payload)
    except Exception as exc:  # noqa: BLE001 — CLI boundary
        result = {
            "ok": False,
            "skill": SKILL,
            "meta": {},
            "checks": [],
            "metrics": {},
            "results": [],
            "assumptions": [],
            "errors": [str(exc)],
        }
        print(str(exc), file=sys.stderr)
        text = json.dumps(result, ensure_ascii=False, indent=2)
        if args.output:
            with open(args.output, "w", encoding="utf-8") as f:
                f.write(text + "\n")
        print(text)
        return 1

    text = json.dumps(result, ensure_ascii=False, indent=2)
    if args.output:
        with open(args.output, "w", encoding="utf-8") as f:
            f.write(text + "\n")
    print(text)
    return 0 if result.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main())
