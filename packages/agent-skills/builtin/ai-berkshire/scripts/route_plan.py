#!/usr/bin/env python3
"""ai-berkshire: scene → recommended skill order (stdlib, no network)."""
from __future__ import annotations

import argparse
import json
import sys
from typing import Any

SKILL = "ai-berkshire"

# intent aliases → canonical scene key
INTENT_ALIASES: dict[str, str] = {
    "quick_screen": "quick_screen",
    "快速筛": "quick_screen",
    "checklist": "quick_screen",
    "investment-checklist": "quick_screen",
    "quality_screen": "quick_screen",
    "去劣": "quick_screen",
    "deep_research": "deep_research",
    "深度研究": "deep_research",
    "investment-research": "deep_research",
    "research": "deep_research",
    "team_research": "team_research",
    "投资团队": "team_research",
    "investment-team": "team_research",
    "earnings": "earnings",
    "财报": "earnings",
    "earnings-review": "earnings",
    "earnings_team": "earnings_team",
    "财报团队": "earnings_team",
    "earnings-team": "earnings_team",
    "industry_funnel": "industry_funnel",
    "行业漏斗": "industry_funnel",
    "industry-funnel": "industry_funnel",
    "industry_research": "industry_research",
    "产业链": "industry_research",
    "industry-research": "industry_research",
    "portfolio": "portfolio",
    "持仓": "portfolio",
    "组合审视": "portfolio",
    "value-portfolio-review": "portfolio",
    "thesis": "thesis",
    "论文": "thesis",
    "value-thesis-tracker": "thesis",
    "thesis_drift": "thesis_drift",
    "漂移": "thesis_drift",
    "thesis-drift": "thesis_drift",
    "news_pulse": "news_pulse",
    "异动": "news_pulse",
    "news-pulse": "news_pulse",
    "management": "management",
    "管理层": "management",
    "management-deep-dive": "management",
    "private": "private",
    "未上市": "private",
    "private-company-research": "private",
    "series": "series",
    "看懂系列": "series",
    "deep-company-series": "series",
    "income": "income",
    "收益型": "income",
    "income-investment": "income",
    "bottleneck": "bottleneck",
    "瓶颈": "bottleneck",
    "bottleneck-hunter": "bottleneck",
    "wechat": "wechat",
    "公众号": "wechat",
    "wechat-article": "wechat",
    "memo_craft": "memo_craft",
    "版式": "memo_craft",
    "investment-memo-craft": "memo_craft",
    "dyp": "dyp",
    "段永平": "dyp",
    "dyp-ask": "dyp",
    "full_stack": "deep_research",
    "综合": "deep_research",
}

# Always-first / always-last helpers (not duplicated in scene lists below)
NORM = "financial-data"
CRAFT = "investment-memo-craft"

SCENES: dict[str, dict[str, Any]] = {
    "quick_screen": {
        "title": "快速筛 / Checklist / 去劣",
        "skills": ["investment-checklist", "quality-screen"],
        "team": False,
        "urgency_boost": ["quality-screen"],
    },
    "deep_research": {
        "title": "深度研究（单人四大师）",
        "skills": ["investment-research", CRAFT],
        "team": False,
        "urgency_boost": [],
    },
    "team_research": {
        "title": "深度研究（四角色团队）",
        "skills": ["investment-team", CRAFT],
        "team": True,
        "urgency_boost": [],
    },
    "earnings": {
        "title": "财报精读",
        "skills": ["earnings-review"],
        "team": False,
        "urgency_boost": [],
    },
    "earnings_team": {
        "title": "财报团队成稿",
        "skills": ["earnings-team"],
        "team": True,
        "urgency_boost": [],
    },
    "industry_funnel": {
        "title": "行业漏斗",
        "skills": ["industry-funnel", "investment-checklist"],
        "team": False,
        "urgency_boost": ["industry-funnel"],
    },
    "industry_research": {
        "title": "产业链全景",
        "skills": ["industry-research"],
        "team": False,
        "urgency_boost": [],
    },
    "portfolio": {
        "title": "持仓价值审视",
        "skills": ["value-portfolio-review"],
        "team": False,
        "urgency_boost": ["value-portfolio-review"],
    },
    "thesis": {
        "title": "持仓论文追踪",
        "skills": ["value-thesis-tracker"],
        "team": False,
        "urgency_boost": ["value-thesis-tracker"],
    },
    "thesis_drift": {
        "title": "论文漂移",
        "skills": ["thesis-drift", "value-thesis-tracker"],
        "team": False,
        "urgency_boost": ["thesis-drift"],
    },
    "news_pulse": {
        "title": "股价异动归因",
        "skills": ["news-pulse"],
        "team": True,
        "urgency_boost": ["news-pulse"],
    },
    "management": {
        "title": "管理层纵深",
        "skills": ["management-deep-dive"],
        "team": False,
        "urgency_boost": [],
    },
    "private": {
        "title": "未上市公司研究",
        "skills": ["private-company-research"],
        "team": True,
        "urgency_boost": [],
    },
    "series": {
        "title": "看懂系列长文",
        "skills": ["deep-company-series"],
        "team": False,
        "urgency_boost": [],
    },
    "income": {
        "title": "收益型分配",
        "skills": ["income-investment"],
        "team": False,
        "urgency_boost": [],
    },
    "bottleneck": {
        "title": "供应链瓶颈",
        "skills": ["bottleneck-hunter"],
        "team": False,
        "urgency_boost": [],
    },
    "wechat": {
        "title": "公众号成稿",
        "skills": ["wechat-article"],
        "team": True,
        "urgency_boost": [],
    },
    "memo_craft": {
        "title": "写作版式叠加",
        "skills": [CRAFT],
        "team": False,
        "urgency_boost": [],
    },
    "dyp": {
        "title": "段永平式问答",
        "skills": ["dyp-ask"],
        "team": False,
        "urgency_boost": [],
    },
}


def _data_meta(mode: str, used: list[str], missing: list[str] | None = None) -> dict[str, Any]:
    m = mode if mode in ("full", "proxy", "insufficient") else "proxy"
    return {
        "data_mode": m,
        "degraded": m == "proxy",
        "used_inputs": list(used),
        "missing_for_full": list(missing or []),
    }


def resolve_scene(intent: Any) -> str | None:
    if intent is None:
        return None
    raw = str(intent).strip()
    if not raw:
        return None
    key = raw.lower().replace(" ", "_").replace("／", "/")
    if key in SCENES:
        return key
    if raw in INTENT_ALIASES:
        return INTENT_ALIASES[raw]
    if key in INTENT_ALIASES:
        return INTENT_ALIASES[key]
    # fuzzy contains
    for alias, scene in INTENT_ALIASES.items():
        if alias in raw or alias in key:
            return scene
    return None


def build_order(scene: str, urgency: str, symbol: str | None) -> list[str]:
    """Order: financial-data (norm) → scene cores → memo-craft last if present.

    report_audit is a later step *reusing* financial-data (see activation_plan notes),
    not a second copy of the skill name at the end.
    """
    cfg = SCENES[scene]
    core: list[str] = list(cfg["skills"])
    urgency_l = (urgency or "normal").strip().lower()
    if urgency_l in ("high", "urgent", "高", "紧急") and cfg.get("urgency_boost"):
        boost = [s for s in cfg["urgency_boost"] if s in core]
        rest = [s for s in core if s not in boost]
        core = boost + rest

    ordered: list[str] = []
    # Norm first except pure content/dyp/memo-only without symbol research
    skip_norm = scene in ("dyp", "wechat", "memo_craft") and not symbol
    if not skip_norm:
        ordered.append(NORM)
    for s in core:
        if s not in ordered:
            ordered.append(s)
    # Keep writing overlay near the end (after research cores)
    if CRAFT in ordered:
        ordered = [x for x in ordered if x != CRAFT] + [CRAFT]
    return ordered


def compute(payload: dict[str, Any]) -> dict[str, Any]:
    intent = payload.get("intent") or payload.get("scene") or payload.get("use_case")
    symbol = payload.get("symbol") or payload.get("ticker")
    urgency = str(payload.get("urgency") or "normal")
    used = ["intent"]
    missing: list[str] = []
    if not intent:
        missing.append("intent")
    scene = resolve_scene(intent)
    if scene is None:
        return {
            "ok": False,
            "skill": SKILL,
            "meta": _data_meta("insufficient", used, missing + ["known_scene"]),
            "recommended_skills": [],
            "scene": None,
            "metrics": {},
            "assumptions": [],
            "errors": [
                f"无法识别 intent={intent!r}；请使用 quick_screen/deep_research/earnings/"
                "industry_funnel/portfolio/thesis/news_pulse 等"
            ],
            "checks": [],
            "notes": {
                "hint": "见 references/route-table.md 或 SCENES 键名",
            },
        }

    if symbol:
        used.append("symbol")
    else:
        missing.append("symbol")

    cfg = SCENES[scene]
    order = build_order(scene, urgency, str(symbol) if symbol else None)
    mode = "full" if intent and scene else "proxy"
    if missing and "symbol" in missing and scene in (
        "deep_research",
        "team_research",
        "earnings",
        "news_pulse",
        "thesis",
    ):
        mode = "proxy"

    plan: list[dict[str, Any]] = []
    for i, name in enumerate(order):
        note = ""
        if name == NORM:
            note = "规范取数 / financial_rigor"
        elif name == CRAFT:
            note = "写作版式叠加"
        elif cfg.get("team") and name != NORM and name != CRAFT:
            note = "run_subagent 并行"
        plan.append(
            {
                "step": i + 1,
                "skill": name,
                "via": "activate_agent_skill",
                "notes": note,
            }
        )
    if scene not in ("dyp",):
        plan.append(
            {
                "step": len(plan) + 1,
                "skill": NORM,
                "via": "activate_agent_skill",
                "notes": "report_audit 抽检建议（extract→verdict）后 create_web",
            }
        )

    return {
        "ok": True,
        "skill": SKILL,
        "meta": _data_meta(mode, used, missing),
        "scene": scene,
        "scene_title": cfg["title"],
        "symbol": symbol,
        "urgency": urgency,
        "team_parallel": bool(cfg.get("team")),
        "recommended_skills": order,
        "activation_plan": plan,
        "deliverable": {
            "default": "create_web",
            "required_sections": [
                "强制结论表",
                "四视角摘要（段永平/巴菲特/芒格/李录，不足则声明）",
                "数据截止日期",
                "免责声明",
                "署名 Opptrix · AI Berkshire 投研流程",
            ],
        },
        "boundary": {
            "vs_multi_role_research_council": (
                "multi-role-research-council 是多空辩论研讨团；"
                "ai-berkshire 是价值投资 skill 总入口与场景路由，勿合并。"
            )
        },
        "metrics": {"skill_count": len(order)},
        "assumptions": [
            "路由只推荐顺序，不自动串行跑完全部 21 个重研究 skill。",
            "team_parallel=true 时主研究 skill 内使用 run_subagent。",
            "activation_plan 末步为 report_audit 建议，不重复插入 recommended_skills。",
        ],
        "errors": [],
        "checks": [{"name": "scene_resolved", "scene": scene}],
    }


def main() -> int:
    ap = argparse.ArgumentParser(description=SKILL + " route_plan")
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
            "meta": {},
            "recommended_skills": [],
            "metrics": {},
            "assumptions": [],
            "errors": [str(e)],
            "checks": [],
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
