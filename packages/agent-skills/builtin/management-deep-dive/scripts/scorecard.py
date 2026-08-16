#!/usr/bin/env python3
"""Investment research scorecard — 结论档位 / 四大师维度分 (stdlib only).

Reads Agent-assembled JSON (workspace evidence + optional rigor results),
outputs decision band + scores with adaptive data_mode.

Usage:
  python3 scripts/scorecard.py --input evidence.json --output scorecard.json
"""
from __future__ import annotations

import argparse
import json
import sys
from typing import Any

SKILL = "management-deep-dive"

BANDS = ("通过", "有条件通过", "不通过", "灰色地带")


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


def _clamp(v: float, lo: float = 1.0, hi: float = 5.0) -> float:
    return max(lo, min(hi, float(v)))


def _detect_mode(payload: dict[str, Any]) -> tuple[str, list[str], list[str], list[str]]:
    used: list[str] = []
    missing: list[str] = []
    assumptions: list[str] = []
    panels = payload.get("panels") if isinstance(payload.get("panels"), dict) else {}
    scores = payload.get("scores") if isinstance(payload.get("scores"), dict) else {}
    gates = payload.get("gates") if isinstance(payload.get("gates"), dict) else {}

    for key in ("quotes", "financials", "profile", "notices_or_filings", "dual_source"):
        if panels.get(key) or payload.get(key):
            used.append(f"panels.{key}" if key in panels or f"panels.{key}" else key)
        else:
            missing.append(key)

    has_scores = all(k in scores for k in ("duan", "buffett", "munger", "li"))
    if has_scores:
        used.append("scores.four_masters")
    else:
        missing.append("scores.four_masters")

    integrity_veto = bool(gates.get("integrity_veto") or gates.get("诚信一票否决"))
    circle_fail = bool(gates.get("outside_circle") or gates.get("能力圈外"))
    mirror_ok = gates.get("mirror_test_ok")
    if mirror_ok is None:
        missing.append("gates.mirror_test_ok")
    else:
        used.append("gates.mirror_test")

    richness = str(payload.get("info_richness") or panels.get("info_richness") or "").upper()
    if richness in ("A", "B", "C"):
        used.append("info_richness")
    else:
        missing.append("info_richness")
        assumptions.append("未标注信息丰富度，按 B 级处理")

    # full: dual source + four scores + mirror + quotes/financials
    need_full = {"quotes", "financials", "scores.four_masters", "gates.mirror_test"}
    have = set()
    if panels.get("quotes") or payload.get("quotes"):
        have.add("quotes")
    if panels.get("financials") or payload.get("financials"):
        have.add("financials")
    if has_scores:
        have.add("scores.four_masters")
    if mirror_ok is not None:
        have.add("gates.mirror_test")
    dual = bool(panels.get("dual_source") or payload.get("dual_source"))
    if dual:
        used.append("panels.dual_source")
        have.add("dual_source")

    if integrity_veto or circle_fail:
        return "full" if has_scores else "proxy", used, [m for m in missing if m not in ("dual_source",)], assumptions

    if need_full.issubset(have) and dual:
        return "full", used, [m for m in missing if m != "dual_source"], assumptions
    if has_scores and (panels.get("financials") or payload.get("financials") or scores):
        assumptions.append("缺双源或镜子测试字段，按 proxy 输出档位")
        return "proxy", used, missing, assumptions
    return "insufficient", used, missing, assumptions + ["证据不足以给出可靠档位"]


def _band_from_scores(
    avg: float,
    *,
    integrity_veto: bool,
    circle_fail: bool,
    mirror_ok: bool | None,
    forced: str | None,
) -> str:
    if forced in BANDS:
        return forced
    if integrity_veto or circle_fail:
        return "不通过"
    if mirror_ok is False:
        return "不通过"
    if avg >= 4.0 and mirror_ok is not False:
        return "通过"
    if avg >= 3.0:
        return "有条件通过"
    if avg > 0:
        return "不通过"
    return "灰色地带"


def run(payload: dict[str, Any]) -> dict[str, Any]:
    scores_in = payload.get("scores") if isinstance(payload.get("scores"), dict) else {}
    gates = payload.get("gates") if isinstance(payload.get("gates"), dict) else {}
    mode, used, missing, assumptions = _detect_mode(payload)

    dims = {
        "duan": _clamp(scores_in.get("duan") or scores_in.get("段永平") or 0) if scores_in else 0.0,
        "buffett": _clamp(scores_in.get("buffett") or scores_in.get("巴菲特") or 0) if scores_in else 0.0,
        "munger": _clamp(scores_in.get("munger") or scores_in.get("芒格") or 0) if scores_in else 0.0,
        "li": _clamp(scores_in.get("li") or scores_in.get("李录") or 0) if scores_in else 0.0,
    }
    present = [v for v in dims.values() if v > 0]
    avg = sum(present) / len(present) if present else 0.0

    integrity_veto = bool(gates.get("integrity_veto") or gates.get("诚信一票否决"))
    circle_fail = bool(gates.get("outside_circle") or gates.get("能力圈外"))
    mirror_ok = gates.get("mirror_test_ok")
    if isinstance(mirror_ok, str):
        mirror_ok = mirror_ok.lower() in ("1", "true", "yes", "y")

    forced = payload.get("decision_band") or gates.get("decision_band")
    band = _band_from_scores(
        avg,
        integrity_veto=integrity_veto,
        circle_fail=circle_fail,
        mirror_ok=None if mirror_ok is None else bool(mirror_ok),
        forced=str(forced) if forced else None,
    )

    if mode == "insufficient" and not present:
        band = "灰色地带"
        ok = False
        errors = ["缺少四大师评分与必要财务证据"]
    else:
        ok = True
        errors = []

    richness = str(payload.get("info_richness") or "").upper() or "B"
    if richness not in ("A", "B", "C"):
        richness = "B"

    result = {
        "ok": ok,
        "skill": SKILL,
        "meta": _data_meta(mode, used, missing, info_richness=richness),
        "decision_band": band,
        "metrics": {
            "score_avg": round(avg, 2),
            "scores": dims,
            "integrity_veto": integrity_veto,
            "outside_circle": circle_fail,
            "mirror_test_ok": mirror_ok,
            "info_richness": richness,
        },
        "checks": [
            {"name": "integrity_veto", "pass": not integrity_veto},
            {"name": "mirror_test", "pass": mirror_ok is not False},
            {"name": "four_master_scores", "pass": len(present) == 4},
        ],
        "assumptions": assumptions,
        "errors": errors,
    }
    return result


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=SKILL + " scorecard")
    p.add_argument("--input", required=True)
    p.add_argument("--output")
    args = p.parse_args(argv)
    try:
        with open(args.input, "r", encoding="utf-8") as f:
            payload = json.load(f)
        result = run(payload)
        text = json.dumps(result, ensure_ascii=False, indent=2)
        if args.output:
            with open(args.output, "w", encoding="utf-8") as f:
                f.write(text + "\n")
        print(text)
        return 0 if result.get("ok") else 1
    except Exception as exc:
        err = {
            "ok": False,
            "skill": SKILL,
            "meta": _data_meta("insufficient", [], ["input"]),
            "decision_band": "灰色地带",
            "metrics": {},
            "checks": [],
            "assumptions": [],
            "errors": [str(exc)],
        }
        print(json.dumps(err, ensure_ascii=False, indent=2))
        print(str(exc), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
