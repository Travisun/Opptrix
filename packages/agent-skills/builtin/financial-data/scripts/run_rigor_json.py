#!/usr/bin/env python3
"""Unified JSON in/out for financial-data skill (stdlib only).

Agent path:
  python3 scripts/run_rigor_json.py --input data.json --output result.json

Input shape (minimal)::

  {
    "meta": {"skill": "financial-data"},
    "command": "verify-market-cap" | "verify-valuation" | "cross-validate"
             | "benford" | "calc" | "three-scenario"
             | "extract" | "verdict",
    "params": { ... command-specific ... },
    "panels": {
      "primary": {...},      # optional dual-source panel
      "secondary": {...},
      "sources": ["a", "b"]  # optional list ≥2 → full
    }
  }

``meta.data_mode``：有双源 panels（或 cross-validate ≥2 来源）→ ``full``；
仅单源 / 仅 params → ``proxy``。
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from typing import Any

# Same-directory imports (skill-local, no package install needed)
_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
if _SCRIPT_DIR not in sys.path:
    sys.path.insert(0, _SCRIPT_DIR)

import financial_rigor as rigor  # noqa: E402
import report_audit as audit  # noqa: E402

SKILL = "financial-data"

RIGOR_COMMANDS = {
    "verify-market-cap",
    "verify-valuation",
    "cross-validate",
    "benford",
    "calc",
    "three-scenario",
}
AUDIT_COMMANDS = {"extract", "verdict"}


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


def _has_dual_panels(panels: dict[str, Any]) -> bool:
    if not isinstance(panels, dict) or not panels:
        return False
    sources = panels.get("sources")
    if isinstance(sources, list) and len([s for s in sources if s]) >= 2:
        return True
    if panels.get("primary") is not None and panels.get("secondary") is not None:
        return True
    if panels.get("opptrix") is not None and (
        panels.get("alt") is not None
        or panels.get("notices") is not None
        or panels.get("institution_report") is not None
        or panels.get("second") is not None
    ):
        return True
    # Named dual financial panels from Agent
    dual_keys = [
        ("financials_a", "financials_b"),
        ("source_a", "source_b"),
        ("panel_a", "panel_b"),
    ]
    for a, b in dual_keys:
        if panels.get(a) is not None and panels.get(b) is not None:
            return True
    return False


def detect_data_mode(payload: dict[str, Any]) -> tuple[str, list[str], list[str], list[str]]:
    """Return (mode, used_inputs, missing_for_full, assumptions)."""
    panels = payload.get("panels") if isinstance(payload.get("panels"), dict) else {}
    params = payload.get("params") if isinstance(payload.get("params"), dict) else {}
    command = str(payload.get("command") or "")
    used: list[str] = []
    missing = ["panels.primary+secondary", "panels.sources[≥2]"]
    assumptions: list[str] = []

    if _has_dual_panels(panels):
        used.append("panels.dual")
        return "full", used, [], [
            "检测到双源 panels，按 full 交叉验证路径标注可信度。",
        ]

    if command == "cross-validate":
        values = params.get("values")
        if isinstance(values, dict) and len(values) >= 2:
            used.extend(["params.values", f"sources:{len(values)}"])
            return "full", used, [], [
                "cross-validate 提供 ≥2 独立来源数值，按 full 处理。",
            ]
        used.append("params.values")
        assumptions.append("交叉验证来源不足 2 个，按 proxy 标注。")
        return "proxy", used, missing, assumptions

    if command == "verdict":
        results = params.get("results")
        if isinstance(results, list):
            dual = any(
                isinstance(r, dict) and r.get("fetched_value") is not None and r.get("fetched_value2") is not None
                for r in results
            )
            used.append("params.results")
            if dual:
                return "full", used + ["fetched_value2"], [], [
                    "verdict 样本含第二源 fetched_value2，按 full 处理。",
                ]
            assumptions.append("核验结果仅单源 fetched_value，按 proxy 标注。")
            return "proxy", used, ["fetched_value2"], assumptions

    if panels:
        used.append("panels")
        assumptions.append("仅有单源 panels，按 proxy 标注；补齐第二源后可升为 full。")
        return "proxy", used, missing, assumptions

    if params:
        used.append("params")
        assumptions.append("仅有单源参数输入（无双源 panels），按 proxy 标注。")
        return "proxy", used, missing, assumptions

    return "insufficient", [], missing + ["params"], [
        "缺少 params / panels，无法执行验算。",
    ]


def _run_rigor(command: str, params: dict[str, Any]) -> dict[str, Any]:
    if command == "verify-market-cap":
        for key in ("price", "shares", "reported"):
            if key not in params:
                raise ValueError(f"verify-market-cap 需要 params.{key}")
        return rigor.verify_market_cap(
            params["price"],
            params["shares"],
            params["reported"],
            params.get("currency", ""),
            quiet=True,
        )
    if command == "verify-valuation":
        if "price" not in params:
            raise ValueError("verify-valuation 需要 params.price")
        return rigor.verify_valuation(
            params["price"],
            eps=params.get("eps"),
            bvps=params.get("bvps"),
            fcf_per_share=params.get("fcf_per_share") or params.get("fcf-per-share"),
            dividend=params.get("dividend"),
            revenue_per_share=params.get("revenue_per_share") or params.get("revenue-per-share"),
            quiet=True,
        )
    if command == "cross-validate":
        values = params.get("values")
        if not isinstance(values, dict) or not values:
            raise ValueError("cross-validate 需要 params.values 为非空对象")
        return rigor.cross_validate(
            params.get("field") or "field",
            values,
            unit=params.get("unit", ""),
            tolerance_pct=float(params.get("tolerance", 2.0)),
            quiet=True,
        )
    if command == "benford":
        values = params.get("values")
        if not isinstance(values, list) or not values:
            raise ValueError("benford 需要 params.values 为非空数组")
        return rigor.benford_check(values, quiet=True)
    if command == "calc":
        expr = params.get("expr")
        if not expr:
            raise ValueError("calc 需要 params.expr")
        return rigor.exact_calc(str(expr), quiet=True)
    if command == "three-scenario":
        growth = params.get("growth")
        pe = params.get("pe")
        if not (isinstance(growth, (list, tuple)) and len(growth) == 3):
            raise ValueError("three-scenario 需要 params.growth 为长度 3 的数组")
        if not (isinstance(pe, (list, tuple)) and len(pe) == 3):
            raise ValueError("three-scenario 需要 params.pe 为长度 3 的数组")
        for key in ("price", "eps", "shares"):
            if key not in params:
                raise ValueError(f"three-scenario 需要 params.{key}")
        return rigor.three_scenario_valuation(
            params["price"],
            params["eps"],
            params["shares"],
            growth[0], growth[1], growth[2],
            pe[0], pe[1], pe[2],
            years=int(params.get("years") or 3),
            currency=params.get("currency", ""),
            quiet=True,
        )
    raise ValueError(f"未知 rigor 命令: {command}")


def _run_audit(command: str, params: dict[str, Any]) -> dict[str, Any]:
    if command == "extract":
        text = params.get("report_text")
        report_path = params.get("report") or params.get("report_path")
        if text is None:
            if not report_path:
                raise ValueError("extract 需要 params.report_text 或 params.report")
            if not os.path.exists(str(report_path)):
                raise ValueError(f"报告文件不存在: {report_path}")
            with open(str(report_path), "r", encoding="utf-8") as f:
                text = f.read()
        all_points = audit.extract_data_points(str(text))
        ratio = float(params.get("ratio") if params.get("ratio") is not None else 0.15)
        seed = params.get("seed")
        sampled = audit.sample_points(all_points, ratio=ratio, seed=seed)
        template = []
        for p in sampled:
            template.append({
                "id": p["id"],
                "label": p["label"],
                "reported_value": p["reported_value"],
                "unit": p["unit"],
                "line_number": p["line_number"],
                "raw_text": p["raw_text"],
                "fetched_value": None,
                "fetched_source": "",
                "fetched_value2": None,
                "fetched_source2": "",
            })
        return {
            "ok": True,
            "total_extracted": len(all_points),
            "sample_count": len(sampled),
            "ratio": ratio,
            "seed": seed,
            "checklist": template,
        }
    if command == "verdict":
        results = params.get("results")
        if isinstance(results, str):
            results = json.loads(results)
        if not isinstance(results, list):
            raise ValueError("verdict 需要 params.results 为数组")
        return audit.render_verdict(results, report_name=params.get("report_name") or "", quiet=True)
    raise ValueError(f"未知 audit 命令: {command}")


def compute(payload: dict[str, Any]) -> dict[str, Any]:
    command = str(payload.get("command") or "").strip()
    if not command:
        raise ValueError("input.command 必填")
    params = payload.get("params") if isinstance(payload.get("params"), dict) else {}
    mode, used, missing, assumptions = detect_data_mode(payload)

    if mode == "insufficient" and command not in ("extract",):
        return {
            "ok": False,
            "skill": SKILL,
            "command": command,
            "result": {},
            "metrics": {},
            "assumptions": assumptions,
            "errors": ["缺少可计算输入（params / panels）"],
            "meta": _data_meta("insufficient", used, missing),
        }

    if command in RIGOR_COMMANDS:
        result = _run_rigor(command, params)
    elif command in AUDIT_COMMANDS:
        result = _run_audit(command, params)
    else:
        raise ValueError(f"不支持的 command: {command}；可选: {sorted(RIGOR_COMMANDS | AUDIT_COMMANDS)}")

    ok = bool(result.get("ok", True))
    if command == "benford" and result.get("insufficient"):
        mode = "insufficient"
        ok = False
        assumptions = assumptions + ["Benford 样本量 < 50，结果不可靠。"]

    metrics: dict[str, Any] = {"command": command}
    if isinstance(result, dict):
        for k in ("deviation_pct", "pass", "warning", "consensus", "all_consistent",
                  "verdict", "pass_count", "fail_count", "total", "sample_count",
                  "total_extracted", "mad", "conformity", "result"):
            if k in result:
                metrics[k] = result[k]

    return {
        "ok": ok,
        "skill": SKILL,
        "command": command,
        "result": result,
        "metrics": metrics,
        "assumptions": assumptions,
        "errors": [] if ok else [str(result.get("error") or result.get("summary") or "command failed")],
        "meta": _data_meta(mode, used, missing if mode != "full" else []),
    }


def main(argv: list[str] | None = None) -> int:
    rigor._force_utf8_stdio()
    ap = argparse.ArgumentParser(description=f"{SKILL} unified JSON runner")
    ap.add_argument("--input", required=True, help="输入 JSON 路径")
    ap.add_argument("--output", help="输出 JSON 路径（可选；仍打印 stdout）")
    args = ap.parse_args(argv)

    try:
        with open(args.input, encoding="utf-8") as f:
            payload = json.load(f)
        if not isinstance(payload, dict):
            raise ValueError("input 须为 JSON 对象")
        out = compute(payload)
    except Exception as exc:
        out = {
            "ok": False,
            "skill": SKILL,
            "command": None,
            "result": {},
            "metrics": {},
            "assumptions": [],
            "errors": [str(exc)],
            "meta": _data_meta("insufficient", [], ["valid_input"]),
        }
        text = json.dumps(out, ensure_ascii=False, indent=2)
        print(text)
        if args.output:
            with open(args.output, "w", encoding="utf-8") as f:
                f.write(text + "\n")
        return 1

    text = json.dumps(out, ensure_ascii=False, indent=2)
    print(text)
    if args.output:
        with open(args.output, "w", encoding="utf-8") as f:
            f.write(text + "\n")
    return 0 if out.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main())
