#!/usr/bin/env python3
"""
行业产业链挖掘报告生成器 — 结合 AStockLayer 数据能力

Serenity 风格深度产业投资挖掘方法论:
1. 产业链全景 -> 找出所有节点
2. 竞争格局 -> 各节点龙头
3. 价值链分配 -> 利润流向
4. 供需拐点 -> 周期位置
5. 核心标的 -> 投资组合
6. 操作策略 -> 持有期限 + 爆发节点
"""

from __future__ import annotations

import logging
import os
import sys
from collections import defaultdict
from datetime import date, datetime, timedelta
from typing import Optional

# 确保 chain_knowledge 可导入
_this_dir = os.path.dirname(os.path.abspath(__file__))
if _this_dir not in sys.path:
    sys.path.insert(0, _this_dir)

from chain_knowledge import resolve_industry, INDUSTRY_CHAINS, INDUSTRY_ALIASES, get_bottleneck_summary, get_tech_generation_map
from visualizer import generate_all_charts, render_charts_section

from a_stock_layer import AshareEngine
from a_stock_layer.utils.http_client import get as http_get

logger = logging.getLogger("industry_mining")


def _pct(v):
    if v is None:
        return "--"
    return f"{v:+.2f}%"


def _fmt(v, unit="亿"):
    if v is None:
        return "--"
    if abs(v) >= 1e8:
        return f"{v/1e8:.2f}{unit}"
    if abs(v) >= 1e4:
        return f"{v/1e4:.2f}万"
    return f"{v:.2f}"


def _flag(v):
    if v is None:
        return "⚪"
    return "🟢" if v > 0 else "🔴" if v < 0 else "⚪"


class IndustryMiningReport:
    """行业投资挖掘报告生成器

    用法:
        engine = AshareEngine()
        reporter = IndustryMiningReport(engine)
        report = reporter.generate("半导体")
        print(report)
    """

    def __init__(self, engine: AshareEngine):
        self.engine = engine

    def generate(self, industry: str) -> str:
        """生成行业深度挖掘报告

        Args:
            industry: 行业名称，如 "半导体"、"新能源汽车"、"光伏"
        """
        std_name, chain = resolve_industry(industry)
        if not chain:
            return self._generate_generic(industry)

        industry_name = std_name or industry
        chain_name = chain["name"]
        nodes = chain["nodes"]
        concepts = chain["concepts"]

        # Phase 1: 发现公司
        company_pool = self._discover_companies(concepts)
        node_map = self._classify_companies(company_pool, nodes)

        # Phase 2: 并行采集各节点数据
        node_analysis = self._analyze_nodes(node_map)

        # Phase 3: 价值链和竞争格局
        value_chain = self._analyze_value_chain(node_analysis)
        competitive = self._analyze_competition(node_analysis)

        # Phase 4: 瓶颈环节分析 + 技术代际路线图
        bottleneck_analysis = get_bottleneck_summary(std_name or industry)
        tech_generations = get_tech_generation_map(std_name or industry)

        # Phase 5: 宏观和资金背景
        macro_context = self._get_macro_context()
        sector_flow = self._get_sector_flow(concepts)

        # Phase 6: 可视化图表
        all_scored = self._score_all_companies(node_analysis)
        stats = {
            "industry": industry_name,
            "total_nodes": len(nodes),
            "bottleneck_count": len(bottleneck_analysis),
            "company_count": total_companies,
            "high_margin_count": len(value_chain[:3]),
        }
        charts = generate_all_charts(
            industry_name, nodes, node_analysis,
            value_chain, competitive, bottleneck_analysis,
            tech_generations, all_scored, stats,
        )

        # Phase 5: 生成报告
        return self._format_report(
            industry_name, chain_name, nodes, node_analysis,
            value_chain, competitive, bottleneck_analysis, tech_generations,
            macro_context, sector_flow, charts,
        )

    # ── Phase 1: 公司发现 ──────────────────────────────────────────

    def _discover_companies(self, concepts: list) -> list:
        """通过概念/行业发现相关上市公司"""
        seen = set()
        companies = []

        # 策略1: 通过股票全市场列表筛选
        try:
            r = self.engine.stock_list("all")
            if r.success and r.data:
                for item in r.data:
                    if len(companies) >= 150:
                        break
                    industry_field = (item.industry or "").lower()
                    name_field = (item.name or "").lower()
                    code = item.code
                    if code in seen:
                        continue
                    for concept in concepts:
                        if concept.lower() in industry_field or concept.lower() in name_field:
                            seen.add(code)
                            companies.append({"code": code, "name": item.name, "industry": item.industry})
                            break
        except Exception:
            pass

        # 策略2: 通过东财概念板块获取
        if len(companies) < 20:
            for concept in concepts:
                try:
                    url = "https://push2.eastmoney.com/api/qt/clist/get"
                    params = {
                        "pn": "1", "pz": "80",
                        "po": "1", "np": "1",
                        "fields": "f12,f14,f3,f100",
                        "fltt": "2", "invt": "2",
                        "fs": f"b:{concept}",
                    }
                    resp = http_get(url, params=params, timeout=10)
                    if resp.status_code == 200:
                        data = resp.json()
                        items = data.get("data", {}).get("diff", []) if data.get("data") else []
                        for item in items:
                            code = str(item.get("f12", ""))
                            if code and code not in seen:
                                seen.add(code)
                                companies.append({
                                    "code": code,
                                    "name": item.get("f14", ""),
                                    "industry": concept,
                                })
                except Exception:
                    continue

        return companies[:100]

    def _classify_companies(self, companies: list, nodes: list) -> dict:
        """将公司分类到产业链各节点"""
        node_map = defaultdict(list)
        unclassified = []

        for comp in companies:
            code = comp["code"]
            name = (comp["name"] or "").lower()
            industry = (comp["industry"] or "").lower()
            search_text = f"{name} {industry}"
            classified = False

            # 获取主营构成辅助分类
            try:
                r = self.engine.main_business(code)
                if r.success and r.data:
                    for mb in r.data:
                        for product in mb.products or []:
                            pname = (product.name or "").lower()
                            search_text += f" {pname}"
            except Exception:
                pass

            # 按关键词匹配节点
            for node in nodes:
                position = node["position"]
                for kw in node["keywords"]:
                    if kw.lower() in search_text:
                        node_map[position].append({
                            "code": code, "name": comp.get("name", ""),
                            "score": 1.0,
                        })
                        classified = True
                        break
                if classified:
                    break

            if not classified:
                unclassified.append(comp)

        # 未分类公司按 profile 匹配
        for comp in unclassified:
            code = comp["code"]
            try:
                r = self.engine.profile(code)
                if r.success and r.data:
                    profile = r.data[0]
                    profile_text = ((profile.main_business or "") + " " +
                                    " ".join(profile.concepts or [])).lower()
                    best_node = None
                    best_score = 0
                    for node in nodes:
                        for kw in node["keywords"]:
                            if kw.lower() in profile_text:
                                if 1.0 > best_score:
                                    best_score = 1.0
                                    best_node = node["position"]
                    if best_node:
                        node_map[best_node].append({
                            "code": code, "name": comp.get("name", ""),
                            "score": best_score * 0.8,
                        })
            except Exception:
                continue

        for pos in node_map:
            node_map[pos].sort(key=lambda x: x["score"], reverse=True)

        return dict(node_map)

    # ── Phase 2: 节点分析 ──────────────────────────────────────────

    def _analyze_nodes(self, node_map: dict) -> dict:
        """分析每个节点上各公司的基本面"""
        result = {}
        for position, companies in node_map.items():
            company_data = []
            for comp in companies[:5]:
                code = comp["code"]
                data = self._analyze_single_company(code)
                if data:
                    data["rank_in_node"] = comp["score"]
                    company_data.append(data)
            result[position] = company_data
        return result

    def _analyze_single_company(self, code: str) -> Optional[dict]:
        """分析单只股票的全维度数据"""
        data = {"code": code}

        try:
            r = self.engine.realtime(code)
            if r.success and r.data:
                q = r.data[0]
                data["name"] = q.name
                data["price"] = q.price
                data["change_pct"] = q.change_pct
                data["market_cap"] = q.market_cap
                data["pe"] = q.pe
                data["pb"] = q.pb
                data["turnover_rate"] = q.turnover_rate
        except Exception:
            pass

        try:
            r = self.engine.profile(code)
            if r.success and r.data:
                p = r.data[0]
                data["industry"] = p.industry
                data["concepts"] = p.concepts
                data["main_business"] = p.main_business
                data["listing_date"] = p.listing_date
        except Exception:
            pass

        try:
            r = self.engine.main_business(code)
            if r.success and r.data:
                mb = r.data[0]
                data["revenue_breakdown"] = [
                    {"name": p.name, "pct": p.revenue_pct, "margin": p.gross_margin}
                    for p in (mb.products or []) if p.name
                ]
                data["total_revenue"] = mb.total_revenue
        except Exception:
            pass

        try:
            r = self.engine.financials(code)
            if r.success and r.data:
                f = r.data[0]
                data["revenue_yoy"] = f.revenue_yoy
                data["profit_yoy"] = f.net_profit_yoy
                data["roe"] = f.roe
                data["gross_margin"] = f.gross_margin
                data["debt_ratio"] = f.debt_ratio
                data["eps"] = f.eps
        except Exception:
            pass

        try:
            r = self.engine.perf_forecast(code)
            if r.success and r.data:
                pf = r.data[0]
                data["forecast_type"] = pf.forecast_type
                data["forecast_change"] = (pf.change_upper or 0 + (pf.change_lower or 0)) / 2
        except Exception:
            pass

        try:
            r = self.engine.kline(code, period="daily", count=252)
            if r.success and r.data:
                klines = r.data
                if len(klines) >= 2:
                    data["year_high"] = max(k.close for k in klines[-252:])
                    data["year_low"] = min(k.close for k in klines[-252:])
                    if len(klines) >= 60:
                        data["60d_change"] = ((klines[-1].close - klines[-60].close)
                                               / klines[-60].close * 100)
        except Exception:
            pass

        try:
            r = self.engine.tech_indicator(code, count=120)
            if r.success and r.data:
                ti = r.data[-1]
                data["ma20"] = ti.ma20
                data["ma60"] = ti.ma60
                data["macd"] = ti.macd
                data["macd_signal"] = ti.macd_signal
                data["rsi_6"] = ti.rsi_6
        except Exception:
            pass

        try:
            r = self.engine.money_flow(code)
            if r.success and r.data and r.data:
                mf = r.data[0]
                data["main_net_flow"] = mf.main_net
        except Exception:
            pass

        try:
            r = self.engine.institutional_visits(code)
            if r.success and r.data:
                data["inst_visits"] = len(r.data)
                data["recent_visit"] = r.data[0].visit_date if r.data else ""
        except Exception:
            pass

        try:
            r = self.engine.rd_investment(code)
            if r.success and r.data:
                rd = r.data[0]
                data["rd_ratio"] = rd.rd_expense_pct
        except Exception:
            pass

        if "name" not in data or not data.get("name"):
            return None

        return data

    # ── Phase 3: 价值链与竞争格局 ──────────────────────────────────

    def _analyze_value_chain(self, node_analysis: dict) -> list:
        """分析价值链分配"""
        chain = []
        for position, companies in node_analysis.items():
            if not companies:
                continue
            avg_gross_margin = 0
            avg_roe = 0
            avg_growth = 0
            total_mcap = 0
            count = 0

            for comp in companies:
                if comp.get("gross_margin"):
                    avg_gross_margin += comp["gross_margin"]
                    count += 1
                if comp.get("roe"):
                    avg_roe += comp["roe"]
                if comp.get("revenue_yoy"):
                    avg_growth += comp["revenue_yoy"]
                if comp.get("market_cap"):
                    total_mcap += comp["market_cap"]

            chain.append({
                "position": position,
                "company_count": len(companies),
                "avg_gross_margin": round(avg_gross_margin / max(count, 1), 1),
                "avg_roe": round(avg_roe / max(len(companies), 1), 1),
                "avg_growth": round(avg_growth / max(len(companies), 1), 1),
                "total_market_cap": total_mcap,
                "top_company": companies[0].get("name", "") if companies else "",
            })

        chain.sort(key=lambda x: x["avg_gross_margin"], reverse=True)
        return chain

    def _analyze_competition(self, node_analysis: dict) -> dict:
        """分析各节点竞争格局"""
        result = {}
        for position, companies in node_analysis.items():
            if len(companies) < 2:
                result[position] = {
                    "concentration": "极高（寡头/独家）",
                    "leader": companies[0].get("name", "") if companies else "",
                    "leader_mcap_share": 100,
                    "follower_gap": "--",
                }
                continue

            total_mcap = sum(c.get("market_cap") or 0 for c in companies[:5])
            leader_mcap = companies[0].get("market_cap") or 0
            leader_share = (leader_mcap / total_mcap * 100) if total_mcap > 0 else 0

            if leader_share > 60:
                concentration = "极高（绝对龙头）"
            elif leader_share > 40:
                concentration = "高（双寡头/一超多强）"
            elif leader_share > 20:
                concentration = "中（分散竞争）"
            else:
                concentration = "低（充分竞争）"

            result[position] = {
                "concentration": concentration,
                "leader": companies[0].get("name", ""),
                "leader_mcap_share": round(leader_share, 1),
            }
        return result

    def _get_macro_context(self) -> dict:
        ctx = {}
        try:
            r = self.engine.macro_indicator()
            if r.success and r.data:
                for item in r.data[:8]:
                    ctx[item.indicator_name] = {
                        "value": item.value, "yoy": item.yoy_change, "date": item.date,
                    }
        except Exception:
            pass
        try:
            r = self.engine.global_index("dji")
            if r.success and r.data:
                ctx["美股道指"] = {"value": r.data[0].price, "change": r.data[0].change_pct}
        except Exception:
            pass
        return ctx

    def _get_sector_flow(self, concepts: list) -> list:
        flows = []
        try:
            r = self.engine.sector_money_flow("industry")
            if r.success and r.data:
                for item in r.data:
                    if any(c.lower() in (item.sector_name or "").lower() for c in concepts):
                        flows.append({"name": item.sector_name, "main_net": item.main_net})
        except Exception:
            pass
        return flows

    # ── Phase 3b: 公司评分 ───────────────────────

    def _score_all_companies(self, node_analysis: dict) -> list:
        scored = []
        for pos, companies in node_analysis.items():
            for comp in companies[:2]:
                if comp.get("name"):
                    growth = comp.get("revenue_yoy") or 0
                    roe = comp.get("roe") or 0
                    margin = comp.get("gross_margin") or 0
                    score = growth + roe * 1.5 + margin * 0.5
                    scored.append((score, pos, comp))
        scored.sort(key=lambda x: x[0], reverse=True)
        return scored

    # ── Phase 4: 投资判断 ──────────────────────────────────────────

    def _evaluate_investment_thesis(self, node_analysis: dict,
                                     value_chain: list) -> dict:
        """综合评估投资策略"""
        thesis = {
            "core_position": "",
            "best_company": "",
            "holding_period": "",
            "bull_case": "",
            "risk_factors": [],
            "catalyst": [],
            "breakout_timing": "",
        }

        if value_chain:
            top = value_chain[0]
            thesis["core_position"] = top["position"]
            thesis["best_company"] = top["top_company"]

        best_data = None
        for pos, companies in node_analysis.items():
            for comp in companies:
                if comp.get("name") == thesis["best_company"]:
                    best_data = comp
                    break

        if best_data:
            price = best_data.get("price") or 0
            year_high = best_data.get("year_high") or 0
            year_low = best_data.get("year_low") or 0
            price_position = ((price - year_low) / max(year_high - year_low, 1) * 100) if year_high > year_low else 50
            growth = best_data.get("revenue_yoy") or 0
            roe = best_data.get("roe") or 0

            if growth > 30 and roe > 15 and price_position < 40:
                thesis["holding_period"] = "中长期（1-3年），主升浪早期"
                thesis["breakout_timing"] = "当前处于相对低位，建议分批建仓"
            elif growth > 20 and roe > 10 and price_position < 60:
                thesis["holding_period"] = "中期（6-12个月），趋势上行中"
                thesis["breakout_timing"] = "上升趋势中，顺势持有"
            elif growth > 10 and price_position > 70:
                thesis["holding_period"] = "中短期（3-6个月），注意估值高位"
                thesis["breakout_timing"] = "已在高位，等待回调或放量突破确认"
            elif growth > 0 and price_position > 80:
                thesis["holding_period"] = "短期（1-3个月），博弈性质"
                thesis["breakout_timing"] = "估值偏高，仅适合短线交易"
            else:
                thesis["holding_period"] = "观察期，等待基本面拐点"
                thesis["breakout_timing"] = "缺乏明确催化剂，耐心等待"

            bull_points = []
            if growth > 20:
                bull_points.append(f"营收增速{growth:+.0f}%，高成长")
            if roe > 15:
                bull_points.append(f"ROE{roe:.1f}%，资本回报优秀")
            if best_data.get("gross_margin", 0) > 40:
                bull_points.append(f"毛利率{best_data['gross_margin']:.0f}%，定价能力强")
            if best_data.get("main_net_flow", 0) and best_data["main_net_flow"] > 0:
                bull_points.append("主力资金持续流入")
            if best_data.get("inst_visits", 0) and best_data["inst_visits"] > 5:
                bull_points.append(f"近期有{best_data['inst_visits']}次机构调研")
            thesis["bull_case"] = "；".join(bull_points) if bull_points else "基本面稳健"

            risks = []
            pe = best_data.get("pe") or 0
            if pe > 80:
                risks.append("估值偏高（PE>80）")
            if best_data.get("debt_ratio", 0) and best_data["debt_ratio"] > 60:
                risks.append(f"负债率{best_data['debt_ratio']:.0f}%")
            if best_data.get("forecast_type") and "减" in (best_data.get("forecast_type", "") or ""):
                risks.append("业绩预减/预亏预警")
            if price_position > 80:
                risks.append(f"股价处于年内高位（{price_position:.0f}%分位）")
            thesis["risk_factors"] = risks if risks else ["暂无显著风险"]

            catalysts = []
            if best_data.get("rd_ratio", 0) and best_data["rd_ratio"] > 10:
                catalysts.append("高研发投入，新产品周期")
            if best_data.get("forecast_type") and "增" in (best_data.get("forecast_type", "") or ""):
                catalysts.append("业绩预增，盈利加速")
            thesis["catalyst"] = catalysts if catalysts else ["行业政策/景气度催化"]

        return thesis

    # ── Phase 5: 报告生成 ─────────────────────────────────────────

    def _format_report(self, industry, chain_name, nodes, node_analysis,
                        value_chain, competitive, bottleneck_analysis, tech_generations,
                        macro, sector_flow, charts=None):
        """格式化完整报告"""
        today = date.today().isoformat()
        lines = []

        lines.append(f"# 🔬 {industry}产业深度挖掘报告 | {today}")
        lines.append("")
        total_companies = sum(len(v) for v in node_analysis.values())
        lines.append(f"> **产业链:** {chain_name}")
        lines.append(f"> **节点数:** {len(nodes)} 个 | **覆盖标的:** {total_companies} 只")
        lines.append("")
        lines.append("---")
        lines.append("")

        # ── 01 产业链全景 ──
        lines.append("## 🗺️ 一、产业链全景图")
        lines.append("")
        for i, node in enumerate(nodes):
            position = node["position"]
            desc = node["desc"]
            companies = node_analysis.get(position, [])
            company_names = "、".join(
                f"{c.get('name', '')}({c.get('code', '')})" for c in companies[:3]
            ) if companies else "（待发现）"
            lines.append(f"### {i+1}. {position}")
            lines.append(f"> {desc}")
            if company_names and "待发现" not in company_names:
                lines.append(f"**代表公司:** {company_names}")
            lines.append("")

        lines.append("---")
        lines.append("")

        # ── 02 价值链分布 ──
        lines.append("## 💰 二、价值链分配（毛利率排序）")
        lines.append("")
        lines.append("| 排名 | 环节 | 平均毛利率 | 平均ROE | 平均营收增速 | 环节市值 | 龙头 |")
        lines.append("|------|------|-----------|---------|-------------|---------|------|")
        for i, vc in enumerate(value_chain):
            lines.append(
                f"| {i+1} | {vc['position']} | {vc['avg_gross_margin']:.1f}% | "
                f"{vc['avg_roe']:.1f}% | {vc['avg_growth']:+.1f}% | "
                f"{_fmt(vc['total_market_cap'])} | {vc['top_company']} |"
            )
        lines.append("")
        if value_chain:
            top_val = value_chain[0]
            lines.append(f"> **价值高地:** {top_val['position']} 毛利率 {top_val['avg_gross_margin']:.1f}%，"
                        f"是产业链中利润率最高的环节")
        lines.append("")
        lines.append("---")
        lines.append("")

        # ── 03 竞争格局 ──
        lines.append("## 🏆 三、竞争格局分析")
        lines.append("")
        for pos, comp in competitive.items():
            companies = node_analysis.get(pos, [])
            lines.append(f"### {pos}")
            lines.append(f"- **格局类型:** {comp['concentration']}")
            lines.append(f"- **龙头:** {comp['leader']}（市值占比 {comp['leader_mcap_share']:.1f}%）")
            if companies:
                all_names = "、".join(
                    f"{c.get('name','')}（PE={c.get('pe','?')}，增速={_pct(c.get('revenue_yoy'))}）"
                    for c in companies[:5] if c.get("name")
                )
                lines.append(f"- **参与者:** {all_names}")
            lines.append("")

        lines.append("---")
        lines.append("")

        # ── 03b 可视化图表 ──
        if charts:
            lines.append(render_charts_section(charts))

        # ── 04 瓶颈环节分析 ──
        if bottleneck_analysis:
            lines.append("## 🔬 四、瓶颈环节分析（卡脖子清单）")
            lines.append("")
            lines.append("| # | 环节 | 瓶颈类型 | 国产化率 | 技术路线 | 关键描述 |")
            lines.append("|---|------|---------|---------|---------|---------|")
            for i, b in enumerate(bottleneck_analysis):
                pos = b.get("position", "")
                btype = b.get("type", "")
                dr = b.get("domestic_rate", "未知")
                tg = b.get("tech_generation", "")
                desc = b.get("desc", "")[:60]
                lines.append(
                    f"| {i+1} | {pos} | {btype} | {dr} | {tg} | {desc} |"
                )
            lines.append("")
            lines.append("> 💡 **投资提示：** 国产化率越低、技术壁垒越高的环节，往往国产替代空间越大。")
            lines.append("")
            lines.append("---")
            lines.append("")

        # ── 05 核心标的 ──
        lines.append("## 🎯 四、核心标的深度评估")
        lines.append("")

        # 综合评分
        all_companies = []
        for pos, companies in node_analysis.items():
            for comp in companies[:2]:
                if comp.get("name"):
                    growth = comp.get("revenue_yoy") or 0
                    roe = comp.get("roe") or 0
                    margin = comp.get("gross_margin") or 0
                    score = growth + roe * 1.5 + margin * 0.5
                    all_companies.append((score, pos, comp))

        all_companies.sort(key=lambda x: x[0], reverse=True)

        thesis = self._evaluate_investment_thesis(node_analysis, value_chain)

        lines.append("### 投资策略总览")
        lines.append("")
        lines.append(f"- **核心配置环节:** {thesis['core_position']}")
        lines.append(f"- **首选标的:** {thesis['best_company']}")
        lines.append(f"- **建议持有期限:** {thesis['holding_period']}")
        lines.append(f"- **启动时机:** {thesis['breakout_timing']}")
        lines.append(f"- **核心逻辑:** {thesis['bull_case']}")
        if thesis["catalyst"]:
            lines.append(f"- **催化剂:** {'；'.join(thesis['catalyst'])}")
        if thesis["risk_factors"]:
            lines.append(f"- **风险提示:** {'；'.join(thesis['risk_factors'])}")
        lines.append("")

        # Top 8
        lines.append("### 核心标的 Top8")
        lines.append("")
        lines.append("| # | 代码 | 名称 | 环节 | 股价 | PE | 涨跌幅 | 营收增速 | 毛利率 | ROE | 主力资金 |")
        lines.append("|---|------|------|------|------|-----|-------|---------|-------|-----|---------|")
        for i, (score, pos, comp) in enumerate(all_companies[:8]):
            pct = _pct(comp.get("change_pct"))
            rev = _pct(comp.get("revenue_yoy"))
            margin = f"{comp.get('gross_margin', 0):.1f}%" if comp.get("gross_margin") else "--"
            roe = f"{comp.get('roe', 0):.1f}%" if comp.get("roe") else "--"
            pe = f"{comp.get('pe', 0):.1f}" if comp.get("pe") else "--"
            flow = _fmt(comp.get("main_net_flow")) if comp.get("main_net_flow") else "--"
            flag = _flag(comp.get("change_pct") or 0)
            lines.append(
                f"| {i+1} | {comp.get('code','')} | {comp.get('name','')} | {pos} | "
                f"{comp.get('price','--')} | {pe} | {flag}{pct} | {rev} | {margin} | {roe} | {flow} |"
            )
        lines.append("")

        # 技术面
        lines.append("### 技术面位置")
        lines.append("")
        lines.append("| 标的 | 现价 | MA20 | MA60 | 相对MA20 | MACD信号 | RSI(6) | 60日涨幅 |")
        lines.append("|------|------|------|------|----------|---------|--------|---------|")
        for pos, companies in node_analysis.items():
            for comp in companies[:2]:
                name = comp.get("name", "")
                price = comp.get("price", "--")
                ma20 = f"{comp.get('ma20', 0):.2f}" if comp.get("ma20") else "--"
                ma60 = f"{comp.get('ma60', 0):.2f}" if comp.get("ma60") else "--"
                rsi6 = f"{comp.get('rsi_6', 0):.1f}" if comp.get("rsi_6") else "--"
                chg60 = _pct(comp.get("60d_change"))
                macd_sig = "多头" if comp.get("macd") and comp.get("macd_signal") and comp["macd"] > comp["macd_signal"] else "空头" if comp.get("macd") else "--"
                if comp.get("price") and comp.get("ma20"):
                    rel = ((comp["price"] - comp["ma20"]) / comp["ma20"] * 100)
                    rel_str = f"{rel:+.1f}%"
                else:
                    rel_str = "--"
                lines.append(f"| {name} | {price} | {ma20} | {ma60} | {rel_str} | {macd_sig} | {rsi6} | {chg60} |")
        lines.append("")

        lines.append("---")
        lines.append("")

        # ── 05 行业前景 ──
        lines.append("## 🔮 六、行业前景与投资展望")
        lines.append("")

        if sector_flow:
            lines.append("### 资金流向")
            for sf in sector_flow:
                direction = "净流入" if (sf.get("main_net") or 0) > 0 else "净流出"
                lines.append(f"- **{sf['name']}:** 主力{direction} {_fmt(abs(sf.get('main_net', 0)))}")
            lines.append("")

        if macro:
            lines.append("### 宏观背景")
            for k, v in macro.items():
                if isinstance(v, dict):
                    if "yoy" in v and v["yoy"]:
                        lines.append(f"- **{k}:** {v.get('value','?')}，同比{v['yoy']:+.1f}%")
                    elif "change" in v and v["change"]:
                        lines.append(f"- **{k}:** {v.get('value','?')}，涨跌幅{v['change']:+.2f}%")
            lines.append("")

        lines.append("### 投资观点")
        lines.append("")

        high_margin_nodes = [v for v in value_chain if v["avg_gross_margin"] > 40]
        high_growth_nodes = [v for v in value_chain if v["avg_growth"] > 20]
        monopoly_nodes = [p for p, c in competitive.items() if "极高" in c["concentration"]]

        points = []
        if high_margin_nodes:
            names = "、".join(n["position"] for n in high_margin_nodes[:3])
            points.append(f"高毛利环节: {names}（毛利率 > 40%）")
        if high_growth_nodes:
            names = "、".join(n["position"] for n in high_growth_nodes[:3])
            points.append(f"高成长环节: {names}（增速 > 20%）")
        if monopoly_nodes:
            names = "、".join(monopoly_nodes[:3])
            points.append(f"寡头格局: {names}（龙头优势明显）")

        for p in points:
            lines.append(f"- **{p}**")
        if not points:
            lines.append("（数据不足，请结合更多信息综合判断）")
        lines.append("")

        if tech_generations:
            lines.append("### 技术代际演进路线")
            lines.append("")
            for pos, gen in list(tech_generations.items())[:5]:
                lines.append(f"- **{pos}:** {gen}")
            lines.append("")

        lines.append("### ⚠️ 风险提示")
        lines.append("")
        lines.append("> ⚠️ 本报告基于公开数据自动生成，不构成投资建议。股市有风险，投资需谨慎。")
        lines.append("")

        lines.append("---")
        lines.append(f"*报告生成: {datetime.now().strftime('%Y-%m-%d %H:%M')} | "
                     f"数据来源: AStockLayer 13数据源自动回退*")

        return "\n".join(lines)

    # ── 通用挖掘 ──────────────────────────────────────────────────

    def _generate_generic(self, industry: str) -> str:
        """行业不在知识库中时的通用挖掘"""
        lines = []
        today = date.today().isoformat()
        lines.append(f"# 🔬 {industry}行业探索报告 | {today}")
        lines.append("")
        lines.append("> 此行业尚未录入产业链知识库，以下为基于数据的初步探索。")
        lines.append("")

        try:
            r = self.engine.stock_list("all")
            related = []
            if r.success and r.data:
                for item in r.data:
                    if not item.industry or not item.name:
                        continue
                    if industry.lower() in item.industry.lower() or industry.lower() in item.name.lower():
                        related.append(item)
            lines.append(f"发现 {len(related)} 只相关股票")
            lines.append("")
            if related:
                lines.append("| 代码 | 名称 | 行业 |")
                lines.append("|------|------|------|")
                for item in related[:20]:
                    lines.append(f"| {item.code} | {item.name} | {item.industry or '--'} |")
            lines.append("")
        except Exception:
            pass

        lines.append("---")
        lines.append(f"*报告生成: {datetime.now().strftime('%Y-%m-%d %H:%M')}*")
        return "\n".join(lines)


if __name__ == "__main__":
    import sys
    engine = AshareEngine()
    reporter = IndustryMiningReport(engine)
    topic = sys.argv[1] if len(sys.argv) > 1 else "半导体"
    print(reporter.generate(topic))
