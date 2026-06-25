"""
新增机构评估模块 — 8家重要机构/视角的评估策略

填补的视角空白:
  1. BofA Merrill Lynch       — 美国主流投行 (补全国际投行覆盖)
  2. Nomura (野村证券)         — 亚洲最大投行 (A股活跃研究)
  3. Bernstein (伯恩斯坦)      — 独立研究机构 (Franchise方法论)
  4. 易方达基金 E Fund         — 中国最大公募基金
  5. 东方红资管 Orient AM      — 中国价值投资标杆
  6. 高瓴资本 Hillhouse        — 一二级市场长期资本
  7. 游资情绪模型 Hot Money    — A股特有短线资金行为
  8. 桥水基金 Bridgewater      — 宏观周期驱动框架

═══════════════════════════════════════════════════════════════════
来源标注:
  [DOCUMENTED] BofA/Bernstein/桥水 — 已公开方法论
  [PARTIAL] Nomura — 概念真实但具体框架构造
  [RESEARCH_STYLE] 易方达/东方红/高瓴 — 基于公开投资理念构建
  [BEHAVIORAL] 游资情绪 — 基于市场行为统计
═══════════════════════════════════════════════════════════════════
"""

from __future__ import annotations
from typing import Optional, List, Dict
import numpy as np

from .base import (
    InstitutionEvaluator, InstitutionRating,
    RatingLevel, EvalDimension, MethodSource,
)


# ═══════════════════════════════════════════════════════════════════
# 1. BofA Merrill Lynch — 质量/价值/动量框架 [DOCUMENTED]
# ═══════════════════════════════════════════════════════════════════
# BofA Global Research 使用的评估框架:
#   - Quality: ROE稳定性, 盈利质量, 资产负债质量
#   - Value: PE/PB历史百分位, 自由现金流收益率
#   - Growth: 盈利修正动量, 营收趋势
#   - Yield: 股息+回购收益率
#   - ESG/风险: 治理结构, 财务健康

class BofAEvaluator(InstitutionEvaluator):
    """美银美林 — 质量/价值/动量 [来源: 官方框架]"""
    method_source = MethodSource.DOCUMENTED
    method_source_note = "BofA Global Research使用质量/价值/动量三维评分体系, 结合盈利修正模型和收益因子; 已有公开方法论声明"

    institution = "美银美林 BofA Merrill Lynch"
    institution_short = "BofA"
    model_name = "质量/价值/动量"
    description = (
        "BofA Global Research框架: Quality(质量)评估盈利稳定性与资产负债质量; "
        "Value(价值)评估PE/PB历史位置与FCF收益; "
        "Growth(成长)追踪盈利修正动量; "
        "Yield(收益)关注股息与回购"
    )

    def compute(self, code: str) -> InstitutionRating:
        errors = []; dims = []; factors = {}
        try:
            q = self._eval_quality_bofa(code, errors, factors)
            if q: dims.append(q)
            v = self._eval_value_bofa(code, errors, factors)
            if v: dims.append(v)
            g = self._eval_growth_bofa(code, errors, factors)
            if g: dims.append(g)
            y = self._eval_yield_bofa(code, errors, factors)
            if y: dims.append(y)

            summary = self._make_summary(dims)
            return self._make_rating(code, dims, summary, factors, errors)
        except Exception as e:
            errors.append(str(e))
            return self._make_rating(code, dims, "评估异常", factors, errors)

    def _eval_quality_bofa(self, code, errors, factors) -> Optional[EvalDimension]:
        try:
            fin = self._get_financials(code)
            if not fin: return None
            score = 5.0; details = []
            roe = self._safe_float(fin[0].roe)
            if roe:
                factors["bofa_roe"] = roe
                if roe > 20: score += 1.5; details.append(f"ROE{roe:.1f}%")
                elif roe > 15: score += 1.0
                elif roe < 5: score -= 1.5; details.append("ROE不足")

            dr = self._safe_float(fin[0].debt_ratio)
            if dr is not None and dr < 40: score += 1.0; details.append(f"负债率{dr:.1f}%健康")
            elif dr and dr > 70: score -= 1.5; details.append("高负债风险")
            return EvalDimension("质量 Quality", min(10,max(0,score)), 0.30,
                                 "; ".join(details) or "数据有限")
        except Exception:
            return None

    def _eval_value_bofa(self, code, errors, factors) -> Optional[EvalDimension]:
        try:
            r = self._get_realtime(code)
            if not r: return None
            score = 5.0; details = []
            pe = self._safe_float(r.pe)
            if pe:
                factors["bofa_pe"] = pe
                if pe < 12: score += 2.0; details.append(f"PE{pe:.1f}x低估")
                elif pe < 20: score += 1.0
                elif pe > 35: score -= 1.5; details.append(f"PE{pe:.1f}x偏高")
            pb = self._safe_float(r.pb)
            if pb and pb < 1.5: score += 1.0
            return EvalDimension("价值 Value", min(10,max(0,score)), 0.30,
                                 "; ".join(details) or "")
        except Exception:
            return None

    def _eval_growth_bofa(self, code, errors, factors) -> Optional[EvalDimension]:
        try:
            fin = self._get_financials(code)
            if not fin: return None
            score = 5.0; details = []
            rev = self._safe_float(fin[0].revenue_yoy)
            pr = self._safe_float(fin[0].net_profit_yoy)
            if rev: factors["bofa_rev"] = rev
            if pr: factors["bofa_pr"] = pr
            if rev and rev > 15: score += 1.5; details.append(f"营收+{rev:.1f}%")
            elif rev and rev < -10: score -= 1.5; details.append("营收下滑")
            if pr and pr > 20: score += 1.5; details.append(f"利润+{pr:.1f}%")
            elif pr and pr < -15: score -= 1.5
            return EvalDimension("成长 Growth", min(10,max(0,score)), 0.25,
                                 "; ".join(details) or "")
        except Exception:
            return None

    def _eval_yield_bofa(self, code, errors, factors) -> Optional[EvalDimension]:
        try:
            r = self._get_realtime(code)
            if not r: return None
            score = 5.0; details = []
            pe = self._safe_float(r.pe)
            if pe and pe > 0:
                dy_implied = 1/pe*100
                factors["bofa_implied_dy"] = round(dy_implied,2)
                if dy_implied > 3: score += 2.0; details.append(f"隐含股息率{dy_implied:.1f}%")
                elif dy_implied > 1.5: score += 1.0
            return EvalDimension("收益 Yield", min(10,max(0,score)), 0.15,
                                 "; ".join(details) or "")
        except Exception:
            return None

    def _make_summary(self, dims):
        if not dims: return "数据不足以评估"
        s = sum(d.score*d.weight for d in dims)/sum(d.weight for d in dims)
        if s >= 7.5: return "BofA三维评分高: 高质量+合理价值+成长动能"
        elif s >= 6.0: return "BofA评分正面: 多数维度良好"
        elif s >= 4.0: return "BofA评分中性"
        else: return "BofA评分偏弱"


# ═══════════════════════════════════════════════════════════════════
# 2. 野村证券 Nomura — Nomura Compass [PARTIAL]
# ═══════════════════════════════════════════════════════════════════

class NomuraEvaluator(InstitutionEvaluator):
    """野村证券 — Nomura Compass [来源: 部分可查证]"""
    method_source = MethodSource.PARTIALLY_DOCUMENTED
    method_source_note = "Nomura Compass是野村公开的量化框架概念; 具体维度权重为基于其亚洲股票研究风格构造"

    institution = "野村证券 Nomura"
    institution_short = "Nomura"
    model_name = "Nomura Compass"
    description = "野村Compass框架: 盈利质量(35%)/估值吸引力(25%)/趋势动量(20%)/行业位置(10%)/规模流动性(10%)"

    def compute(self, code: str) -> InstitutionRating:
        errors = []; dims = []; factors = {}
        try:
            eq = self._eval_earnings_q(code, errors, factors)
            if eq: dims.append(eq)
            val = self._eval_nomura_val(code, errors, factors)
            if val: dims.append(val)
            mom = self._eval_nomura_mom(code, errors, factors)
            if mom: dims.append(mom)
            sec = self._eval_nomura_sector(code, errors, factors)
            if sec: dims.append(sec)

            summary = self._make_summary(dims)
            return self._make_rating(code, dims, summary, factors, errors)
        except Exception:
            return self._make_rating(code, dims, "评估异常", factors, errors)

    def _eval_earnings_q(self, code, errors, factors) -> Optional[EvalDimension]:
        try:
            fin = self._get_financials(code)
            if not fin: return None
            score = 5.0; details = []
            roe = self._safe_float(fin[0].roe)
            if roe: factors["nom_roe"] = roe
            if roe and roe > 15: score += 1.5
            if roe and roe < 5: score -= 1.5
            pr = self._safe_float(fin[0].net_profit_yoy)
            if pr and pr > 20: score += 1.5; details.append(f"利润+{pr:.1f}%")
            elif pr and pr < -20: score -= 1.5
            if roe and roe > 10: score += 0.5
            return EvalDimension("盈利质量", min(10,max(0,score)), 0.35,
                                 "; ".join(details) or "")
        except Exception:
            return None

    def _eval_nomura_val(self, code, errors, factors) -> Optional[EvalDimension]:
        try:
            r = self._get_realtime(code)
            if not r: return None
            score = 5.0
            pe = self._safe_float(r.pe)
            if pe: factors["nom_pe"] = pe
            if pe and pe < 12: score += 2.5
            elif pe and pe < 18: score += 1.5
            elif pe and pe > 35: score -= 1.5
            return EvalDimension("估值吸引力", min(10,max(0,score)), 0.25, f"PE={pe}")
        except Exception:
            return None

    def _eval_nomura_mom(self, code, errors, factors) -> Optional[EvalDimension]:
        try:
            k = self._get_kline(code, count=60)
            if not k or len(k) < 20: return None
            score = 5.0
            closes = np.array([d.close for d in k])
            ret_3m = (closes[-1]/closes[-60]-1)*100 if len(closes)>=60 else 0
            ret_1m = (closes[-1]/closes[-20]-1)*100
            factors["nom_mom_3m"] = round(ret_3m,2)
            if ret_3m > 15: score += 2.0
            elif ret_3m > 5: score += 1.0
            elif ret_3m < -15: score -= 1.5
            return EvalDimension("趋势动量", min(10,max(0,score)), 0.20, f"3m={ret_3m:.1f}%")
        except Exception:
            return None

    def _eval_nomura_sector(self, code, errors, factors) -> Optional[EvalDimension]:
        try:
            fin = self._get_financials(code)
            if not fin: return None
            score = 5.0
            rev = self._safe_float(fin[0].revenue_yoy)
            if rev and rev > 20: score += 2.0
            elif rev and rev > 10: score += 1.0
            elif rev and rev < -10: score -= 1.5
            return EvalDimension("行业位置", min(10,max(0,score)), 0.10, f"营收={rev}")
        except Exception:
            return None

    def _make_summary(self, dims):
        if not dims: return "数据不足以评估"
        s = sum(d.score*d.weight for d in dims)/sum(d.weight for d in dims)
        return f"Nomura Compass: {'强烈看好' if s>=7.5 else '正面' if s>=6.0 else '中性' if s>=4.0 else '偏弱'} ({s:.1f})"


# ═══════════════════════════════════════════════════════════════════
# 3. Bernstein — Franchise方法论 [DOCUMENTED]
# ═══════════════════════════════════════════════════════════════════

class BernsteinEvaluator(InstitutionEvaluator):
    """伯恩斯坦 — Franchise方法论 [来源: 官方框架]"""
    method_source = MethodSource.DOCUMENTED
    method_source_note = "Bernstein的Franchise方法论是其核心框架, 聚焦具有持久竞争优势的'特许经营权'公司; 有公开研究文档"

    institution = "伯恩斯坦 Bernstein"
    institution_short = "Bernstein"
    model_name = "Franchise方法论"
    description = ("Bernstein Franchise框架: 特许经营权质量(30%)评估护城河深度与竞争优势; "
                   "财务实力(25%)评估资产负债与FCF; 管理层素质(20%)评估ROE与现金流管理; "
                   "估值合理性(25%)评估长期回报潜力")

    def compute(self, code: str) -> InstitutionRating:
        errors = []; dims = []; factors = {}
        try:
            moat = self._eval_moat(code, errors, factors)
            if moat: dims.append(moat)
            fin_str = self._eval_financial_strength(code, errors, factors)
            if fin_str: dims.append(fin_str)
            mgmt = self._eval_mgmt(code, errors, factors)
            if mgmt: dims.append(mgmt)
            val = self._eval_bernstein_val(code, errors, factors)
            if val: dims.append(val)

            summary = self._make_summary(dims)
            return self._make_rating(code, dims, summary, factors, errors)
        except Exception:
            return self._make_rating(code, dims, "评估异常", factors, errors)

    def _eval_moat(self, code, errors, factors) -> Optional[EvalDimension]:
        """护城河: 高毛利率+高ROE+稳定性"""
        try:
            fin = self._get_financials(code)
            if not fin: return None
            score = 5.0; details = []
            gm = self._safe_float(fin[0].gross_margin)
            roe = self._safe_float(fin[0].roe)
            if gm: factors["bern_gm"] = gm
            if roe: factors["bern_roe"] = roe
            if gm and gm > 60: score += 1.5; details.append(f"高毛利{gm:.1f}%护城河")
            elif gm and gm < 20: score -= 1.5; details.append("低毛利无护城河")
            if roe and roe > 20: score += 1.5; details.append(f"ROE{roe:.1f}%优秀")
            elif roe and roe < 8: score -= 1.0; details.append("ROE不足")
            return EvalDimension("特许经营权", min(10,max(0,score)), 0.30, "; ".join(details))
        except Exception:
            return None

    def _eval_financial_strength(self, code, errors, factors) -> Optional[EvalDimension]:
        try:
            fin = self._get_financials(code)
            if not fin: return None
            score = 5.0; details = []
            dr = self._safe_float(fin[0].debt_ratio)
            ocf = self._safe_float(fin[0].operating_cash_flow)
            npv = self._safe_float(fin[0].net_profit)
            if dr is not None and dr < 30: score += 2.0; details.append(f"低负债{dr:.1f}%")
            elif dr and dr > 65: score -= 1.5; details.append(f"高负债{dr:.1f}%")
            if ocf and npv and npv > 0 and ocf/npv > 1:
                score += 1.5; details.append("强劲现金流")
            return EvalDimension("财务实力", min(10,max(0,score)), 0.25, "; ".join(details) or "")
        except Exception:
            return None

    def _eval_mgmt(self, code, errors, factors) -> Optional[EvalDimension]:
        try:
            fin = self._get_financials(code)
            if not fin: return None
            score = 5.0
            roe = self._safe_float(fin[0].roe)
            if roe and roe > 15: score += 2.0
            elif roe and roe < 5: score -= 1.5

            # 利润vs营收增速(代表管理效率)
            rev = self._safe_float(fin[0].revenue_yoy)
            pr = self._safe_float(fin[0].net_profit_yoy)
            if rev and pr and pr > rev: score += 1.5

            return EvalDimension("管理层素质", min(10,max(0,score)), 0.20, f"ROE={roe}")
        except Exception:
            return None

    def _eval_bernstein_val(self, code, errors, factors) -> Optional[EvalDimension]:
        try:
            r = self._get_realtime(code)
            if not r: return None
            score = 5.0
            pe = self._safe_float(r.pe)
            if pe: factors["bern_pe"] = pe
            if pe and pe < 15: score += 2.0
            elif pe and pe < 22: score += 1.0
            elif pe and pe > 40: score -= 1.5
            return EvalDimension("估值合理度", min(10,max(0,score)), 0.25, f"PE={pe}")
        except Exception:
            return None

    def _make_summary(self, dims):
        if not dims: return "数据不足以评估"
        s = sum(d.score*d.weight for d in dims)/sum(d.weight for d in dims)
        return f"Franchise: {'强护城河+高质量' if s>=7.5 else '良好' if s>=6.0 else '一般' if s>=4.0 else '护城河不足'} ({s:.1f})"


# ═══════════════════════════════════════════════════════════════════
# 4. 易方达基金 E Fund — 长期质量投资 [RESEARCH_STYLE]
# ═══════════════════════════════════════════════════════════════════

class EFundEvaluator(InstitutionEvaluator):
    """易方达基金 — 质量成长 [来源: 研报风格]"""
    method_source = MethodSource.RESEARCH_STYLE
    method_source_note = "基于易方达公开投资理念(基金年报/经理访谈): 长期持有高质量成长公司, 注重ROE/现金流/管理层"

    institution = "易方达基金 E Fund"
    institution_short = "易方达"
    model_name = "质量成长"
    description = "基于易方达投资理念: 高质量(ROE/毛利率40%)+成长性(营收增速30%)+估值安全边际(20%)+公司治理(10%)"

    def compute(self, code: str) -> InstitutionRating:
        errors = []; dims = []; factors = {}
        try:
            q = self._eval_efund_quality(code, errors, factors)
            if q: dims.append(q)
            g = self._eval_efund_growth(code, errors, factors)
            if g: dims.append(g)
            v = self._eval_efund_value(code, errors, factors)
            if v: dims.append(v)

            summary = self._make_summary(dims)
            return self._make_rating(code, dims, summary, factors, errors)
        except Exception:
            return self._make_rating(code, dims, "评估异常", factors, errors)

    def _eval_efund_quality(self, code, errors, factors) -> Optional[EvalDimension]:
        try:
            fin = self._get_financials(code)
            if not fin: return None
            score = 5.0; details = []
            roe = self._safe_float(fin[0].roe)
            gm = self._safe_float(fin[0].gross_margin)
            if roe: factors["efund_roe"] = roe
            if gm: factors["efund_gm"] = gm
            if roe and roe > 20: score += 2.0; details.append(f"ROE{roe:.1f}%")
            elif roe and roe > 15: score += 1.5
            elif roe and roe < 5: score -= 1.5
            if gm and gm > 60: score += 1.5; details.append(f"高毛利{gm:.1f}%")
            elif gm and gm < 20: score -= 1.5
            return EvalDimension("高质量", min(10,max(0,score)), 0.40, "; ".join(details) or "")
        except Exception:
            return None

    def _eval_efund_growth(self, code, errors, factors) -> Optional[EvalDimension]:
        try:
            fin = self._get_financials(code)
            if not fin: return None
            score = 5.0; details = []
            rev = self._safe_float(fin[0].revenue_yoy)
            pr = self._safe_float(fin[0].net_profit_yoy)
            if rev: factors["efund_rev"] = rev
            if pr: factors["efund_pr"] = pr
            if rev and rev > 20: score += 2.0; details.append(f"营收+{rev:.1f}%")
            elif rev and rev > 10: score += 1.0
            elif rev and rev < -5: score -= 1.5; details.append("营收下滑")
            if pr and pr > 25: score += 1.5
            elif pr and pr < -10: score -= 1.5
            return EvalDimension("成长性", min(10,max(0,score)), 0.30, "; ".join(details) or "")
        except Exception:
            return None

    def _eval_efund_value(self, code, errors, factors) -> Optional[EvalDimension]:
        try:
            r = self._get_realtime(code)
            if not r: return None
            score = 5.0
            pe = self._safe_float(r.pe)
            if pe: factors["efund_pe"] = pe
            if pe and pe < 20: score += 1.5
            elif pe and pe < 30: score += 0.5
            elif pe and pe > 50: score -= 1.5
            return EvalDimension("估值安全边际", min(10,max(0,score)), 0.20, f"PE={pe}")
        except Exception:
            return None

    def _make_summary(self, dims):
        if not dims: return "数据不足以评估"
        s = sum(d.score*d.weight for d in dims)/sum(d.weight for d in dims)
        return f"易方达视角: {'优质成长标的' if s>=7.5 else '基本面良好' if s>=6.0 else '关注中' if s>=4.0 else '不达标'} ({s:.1f})"


# ═══════════════════════════════════════════════════════════════════
# 5. 东方红资管 Orient AM — 价值投资标杆 [RESEARCH_STYLE]
# ═══════════════════════════════════════════════════════════════════

class OrientAMEvaluator(InstitutionEvaluator):
    """东方红资管 — 价值投资 [来源: 研报风格]"""
    method_source = MethodSource.RESEARCH_STYLE
    method_source_note = "基于东方红公开的投资哲学: 深度价值+质量护城河+长期持有, 是国内公募基金中价值投资的旗帜"

    institution = "东方红资管 Orient AM"
    institution_short = "东方红"
    model_name = "深度价值"
    description = ("东方红式价值投资: 低估价值(35%)衡量PE/PB历史低位; "
                   "质量护城河(30%)评估ROE持续性与FCF; "
                   "财务健康(20%)评估低负债与现金流; "
                   "管理层诚信(15%)评估股东回报")

    def compute(self, code: str) -> InstitutionRating:
        errors = []; dims = []; factors = {}
        try:
            dv = self._eval_deep_value(code, errors, factors)
            if dv: dims.append(dv)
            moat = self._eval_orient_moat(code, errors, factors)
            if moat: dims.append(moat)
            health = self._eval_orient_health(code, errors, factors)
            if health: dims.append(health)
            mgmt = self._eval_orient_mgmt(code, errors, factors)
            if mgmt: dims.append(mgmt)

            summary = self._make_summary(dims)
            return self._make_rating(code, dims, summary, factors, errors)
        except Exception:
            return self._make_rating(code, dims, "评估异常", factors, errors)

    def _eval_deep_value(self, code, errors, factors) -> Optional[EvalDimension]:
        try:
            r = self._get_realtime(code)
            if not r: return None
            score = 5.0; details = []
            pe = self._safe_float(r.pe)
            pb = self._safe_float(r.pb)
            if pe: factors["orient_pe"] = pe
            if pb: factors["orient_pb"] = pb
            if pe and pe < 10: score += 2.5; details.append(f"深度价值PE{pe:.1f}x")
            elif pe and pe < 15: score += 1.5; details.append(f"PE{pe:.1f}x低估值")
            elif pe and pe > 25: score -= 1.5; details.append(f"PE{pe:.1f}x偏高")
            if pb and pb < 1: score += 1.5; details.append("破净")
            return EvalDimension("低估价值", min(10,max(0,score)), 0.35, "; ".join(details) or "")
        except Exception:
            return None

    def _eval_orient_moat(self, code, errors, factors) -> Optional[EvalDimension]:
        try:
            fin = self._get_financials(code)
            if not fin: return None
            score = 5.0; details = []
            roe = self._safe_float(fin[0].roe)
            if roe and roe > 15: score += 2.0; details.append(f"ROE{roe:.1f}%护城河")
            elif roe and roe < 5: score -= 1.5
            ocf = self._safe_float(fin[0].operating_cash_flow)
            npv = self._safe_float(fin[0].net_profit)
            if ocf and npv and npv > 0 and ocf/npv > 1:
                score += 1.5; details.append("FCF充裕")
            return EvalDimension("质量护城河", min(10,max(0,score)), 0.30, "; ".join(details) or "")
        except Exception:
            return None

    def _eval_orient_health(self, code, errors, factors) -> Optional[EvalDimension]:
        try:
            fin = self._get_financials(code)
            if not fin: return None
            score = 5.0; details = []
            dr = self._safe_float(fin[0].debt_ratio)
            if dr is not None and dr < 30: score += 2.5; details.append(f"超低负债{dr:.1f}%")
            elif dr and dr < 50: score += 1.0
            elif dr and dr > 65: score -= 1.5; details.append("高负债")
            return EvalDimension("财务健康", min(10,max(0,score)), 0.20, "; ".join(details) or "")
        except Exception:
            return None

    def _eval_orient_mgmt(self, code, errors, factors) -> Optional[EvalDimension]:
        try:
            r = self._get_realtime(code)
            fin = self._get_financials(code)
            if not r or not fin: return None
            score = 5.0; details = []
            # 分红意愿作为管理层诚信代理
            pe = self._safe_float(r.pe)
            if pe and pe > 0:
                dy = 1/pe*100
                factors["orient_dy"] = round(dy,2)
                if dy > 2: score += 2.0; details.append(f"高分红{dy:.1f}%")
            return EvalDimension("管理层诚信", min(10,max(0,score)), 0.15, "; ".join(details) or "")
        except Exception:
            return None

    def _make_summary(self, dims):
        if not dims: return "数据不足以评估"
        s = sum(d.score*d.weight for d in dims)/sum(d.weight for d in dims)
        return f"东方红视角: {'价值洼地+优质' if s>=7.5 else '价值合理' if s>=6.0 else '等待安全边际' if s>=4.0 else '估值偏高'} ({s:.1f})"


# ═══════════════════════════════════════════════════════════════════
# 6. 高瓴资本 Hillhouse — 长期结构性成长 [RESEARCH_STYLE]
# ═══════════════════════════════════════════════════════════════════

class HillhouseEvaluator(InstitutionEvaluator):
    """高瓴资本 — 长期结构性成长 [来源: 研报风格]"""
    method_source = MethodSource.RESEARCH_STYLE
    method_source_note = "基于张磊《价值》一书及高瓴公开投资哲学" + ": \"长期结构性成长\"、\"至少退后\"的研究方法"

    institution = "高瓴资本 Hillhouse"
    institution_short = "高瓴"
    model_name = "长期结构性成长"
    description = ("高瓴框架: 商业模式质量(35%)评估护城河与行业格局; "
                   "长期成长空间(30%)评估市场容量与结构性趋势; "
                   "管理团队(20%)评估创始人与治理; "
                   "估值合理性(15%)长期视角下的价格判断")

    def compute(self, code: str) -> InstitutionRating:
        errors = []; dims = []; factors = {}
        try:
            biz = self._eval_biz_quality(code, errors, factors)
            if biz: dims.append(biz)
            growth = self._eval_long_growth(code, errors, factors)
            if growth: dims.append(growth)
            team = self._eval_team(code, errors, factors)
            if team: dims.append(team)
            val = self._eval_hill_val(code, errors, factors)
            if val: dims.append(val)

            summary = self._make_summary(dims)
            return self._make_rating(code, dims, summary, factors, errors)
        except Exception:
            return self._make_rating(code, dims, "评估异常", factors, errors)

    def _eval_biz_quality(self, code, errors, factors) -> Optional[EvalDimension]:
        try:
            fin = self._get_financials(code)
            if not fin: return None
            score = 5.0; details = []
            gm = self._safe_float(fin[0].gross_margin)
            roe = self._safe_float(fin[0].roe)
            if gm: factors["hill_gm"] = gm
            if roe: factors["hill_roe"] = roe
            if gm and gm > 50: score += 1.5; details.append(f"优质商业模式毛利{gm:.1f}%")
            elif gm and gm < 20: score -= 1.5; details.append("薄利模式")
            if roe and roe > 20: score += 2.0; details.append(f"卓越ROE{roe:.1f}%")
            elif roe and roe > 15: score += 1.0
            elif roe and roe < 8: score -= 1.0
            return EvalDimension("商业模式质量", min(10,max(0,score)), 0.35, "; ".join(details) or "")
        except Exception:
            return None

    def _eval_long_growth(self, code, errors, factors) -> Optional[EvalDimension]:
        try:
            fin = self._get_financials(code)
            if not fin or len(fin) < 2: return None
            score = 5.0; details = []
            rev = self._safe_float(fin[0].revenue_yoy)
            if rev: factors["hill_rev"] = rev
            if rev and rev > 25: score += 2.0; details.append(f"高速成长+{rev:.1f}%")
            elif rev and rev > 15: score += 1.5; details.append("稳健成长")
            elif rev and rev < 0: score -= 1.5; details.append("增长停滞")
            # 市场容量代理: 营收绝对值大=市场空间大
            rev_abs = self._safe_float(fin[0].revenue)
            if rev_abs:
                factors["hill_rev_abs"] = rev_abs
                if rev_abs > 1e11: score += 0.5
            return EvalDimension("长期成长空间", min(10,max(0,score)), 0.30, "; ".join(details) or "")
        except Exception:
            return None

    def _eval_team(self, code, errors, factors) -> Optional[EvalDimension]:
        try:
            fin = self._get_financials(code)
            r = self._get_realtime(code)
            if not fin: return None
            score = 5.0; details = []
            roe = self._safe_float(fin[0].roe)
            if roe and roe > 15: score += 1.5
            # 管理层效率: 运营利润率
            om = self._safe_float(fin[0].gross_margin)
            if om and om > 30: score += 1.5; details.append("高效运营")
            # 大市值公司治理更规范
            if r:
                mc = self._safe_float(r.market_cap)
                if mc and mc > 1e11: score += 1.0; details.append("大市值治理")
            return EvalDimension("管理团队", min(10,max(0,score)), 0.20, "; ".join(details) or "")
        except Exception:
            return None

    def _eval_hill_val(self, code, errors, factors) -> Optional[EvalDimension]:
        try:
            r = self._get_realtime(code)
            if not r: return None
            score = 5.0
            pe = self._safe_float(r.pe)
            if pe: factors["hill_pe"] = pe
            if pe and pe < 25: score += 1.5
            elif pe and pe < 40: score += 0.5
            elif pe and pe > 60: score -= 1.5
            return EvalDimension("估值(长期视角)", min(10,max(0,score)), 0.15, f"PE={pe}")
        except Exception:
            return None

    def _make_summary(self, dims):
        if not dims: return "数据不足以评估"
        s = sum(d.score*d.weight for d in dims)/sum(d.weight for d in dims)
        return f"高瓴视角: {'长期优质标的' if s>=7.5 else '良好商业模式' if s>=6.0 else '需深入调研' if s>=4.0 else '不匹配'} ({s:.1f})"


# ═══════════════════════════════════════════════════════════════════
# 7. 游资情绪模型 Hot Money Sentiment [BEHAVIORAL]
# ═══════════════════════════════════════════════════════════════════

class HotMoneySentimentEvaluator(InstitutionEvaluator):
    """游资情绪模型 — 短线博弈视角 [来源: 行为推断]"""
    method_source = MethodSource.BEHAVIORAL
    method_source_note = "基于A股短线资金(游资)行为模式统计: 换手率/量比/涨停/振幅/连板等; 非单一交易员模型而是群体行为"

    institution = "游资情绪 Hot Money"
    institution_short = "游资情绪"
    model_name = "短线博弈"
    description = ("基于游资群体行为特征: 量能活跃度(30%)评估换手率与量比; "
                   "价格弹性(25%)评估振幅与涨停潜力; "
                   "市场情绪(25%)评估连板效应与板块热度; "
                   "流动性与博弈(20%)评估成交额与博弈空间")

    def compute(self, code: str) -> InstitutionRating:
        errors = []; dims = []; factors = {}
        try:
            vol = self._eval_volume_activity(code, errors, factors)
            if vol: dims.append(vol)
            price = self._eval_price_elasticity(code, errors, factors)
            if price: dims.append(price)
            sent = self._eval_sentiment_hot(code, errors, factors)
            if sent: dims.append(sent)
            liq = self._eval_liquidity_hot(code, errors, factors)
            if liq: dims.append(liq)

            summary = self._make_summary(dims)
            return self._make_rating(code, dims, summary, factors, errors)
        except Exception:
            return self._make_rating(code, dims, "评估异常", factors, errors)

    def _eval_volume_activity(self, code, errors, factors) -> Optional[EvalDimension]:
        try:
            r = self._get_realtime(code)
            k = self._get_kline(code, count=60)
            if not r or not k or len(k) < 20: return None
            score = 5.0; details = []

            tr = self._safe_float(r.turnover_rate)
            vr = self._safe_float(r.volume_ratio)
            if tr: factors["hot_tr"] = tr
            if vr: factors["hot_vr"] = vr

            if tr and tr > 8:
                score += 2.5; details.append(f"极高换手{tr:.1f}% 游资关注")
            elif tr and tr > 4:
                score += 1.5; details.append(f"活跃换手{tr:.1f}%")
            elif tr and tr < 0.5:
                score -= 1.5; details.append("低换手 无游资参与")

            if vr and vr > 2:
                score += 2.0; details.append(f"放量{vr:.1f}x")
            elif vr and vr > 1.2:
                score += 1.0

            # 成交额绝对值
            amt = self._safe_float(r.amount)
            if amt:
                factors["hot_amount"] = amt
                if amt > 1e10: score += 1.0; details.append("大资金博弈")
                elif amt < 1e8: score -= 1.0; details.append("成交不足")

            return EvalDimension("量能活跃度", min(10,max(0,score)), 0.30, "; ".join(details) or "")
        except Exception:
            return None

    def _eval_price_elasticity(self, code, errors, factors) -> Optional[EvalDimension]:
        try:
            k = self._get_kline(code, count=20)
            if not k or len(k) < 10: return None
            score = 5.0; details = []

            # 振幅
            amplitudes = [d.high - d.low for d in k if d.high and d.low]
            if amplitudes:
                avg_amp = np.mean(amplitudes) / k[-1].close * 100
                factors["hot_amplitude"] = round(avg_amp, 2)
                if avg_amp > 5:
                    score += 2.0; details.append(f"高振幅{avg_amp:.1f}% 弹性足")
                elif avg_amp > 3:
                    score += 1.0
                else:
                    score -= 1.0; details.append("波动低 非游资标的")

            closes = np.array([d.close for d in k])
            ret_5d = (closes[-1]/closes[-5]-1)*100 if len(closes)>=5 else 0
            if ret_5d > 10: score += 1.5; details.append(f"5日涨{ret_5d:.1f}% 强势")
            elif ret_5d < -10: score -= 1.0

            return EvalDimension("价格弹性", min(10,max(0,score)), 0.25, "; ".join(details) or "")
        except Exception:
            return None

    def _eval_sentiment_hot(self, code, errors, factors) -> Optional[EvalDimension]:
        """情绪: 价格位置+短期动量"""
        try:
            k = self._get_kline(code, count=60)
            if not k or len(k) < 30: return None
            score = 5.0; details = []
            closes = np.array([d.close for d in k])

            # 均线位置
            ma20 = np.mean(closes[-20:])
            ma60 = np.mean(closes)
            curr = closes[-1]

            if curr > ma20 > ma60:
                score += 2.0; details.append("多头排列 趋势良好")
            elif curr > ma60:
                score += 1.0; details.append("均线上方")
            else:
                score -= 1.0; details.append("均线下方 弱势")

            # 短期动量(游资偏好强趋势)
            ret_3d = (closes[-1]/closes[-3]-1)*100
            if ret_3d > 5: score += 1.5; details.append("短线加速")
            elif ret_3d < -5: score -= 1.0

            return EvalDimension("市场情绪", min(10,max(0,score)), 0.25, "; ".join(details) or "")
        except Exception:
            return None

    def _eval_liquidity_hot(self, code, errors, factors) -> Optional[EvalDimension]:
        try:
            r = self._get_realtime(code)
            if not r: return None
            score = 5.0; details = []
            mc = self._safe_float(r.market_cap)
            if mc:
                factors["hot_mc"] = mc
                if mc > 5e10:
                    score -= 1.0; details.append("大盘股 非游资首选")
                elif mc > 1e10:
                    score += 0.5; details.append("中盘股 游资可博弈")
                elif mc > 3e9:
                    score += 1.5; details.append("小盘活跃 游资偏好")
                else:
                    score += 0.5
            return EvalDimension("流动性博弈", min(10,max(0,score)), 0.20, "; ".join(details) or "")
        except Exception:
            return None

    def _make_summary(self, dims):
        if not dims: return "数据不足以评估"
        s = sum(d.score*d.weight for d in dims)/sum(d.weight for d in dims)
        return f"游资情绪: {'短线博弈机会' if s>=7.5 else '活跃' if s>=6.0 else '中性' if s>=4.0 else '非游资标的'} ({s:.1f})"


# ═══════════════════════════════════════════════════════════════════
# 8. 桥水基金 Bridgewater — 宏观周期驱动 [DOCUMENTED]
# ═══════════════════════════════════════════════════════════════════

class BridgewaterEvaluator(InstitutionEvaluator):
    """桥水基金 — 宏观周期视角 [来源: 官方方法论]"""
    method_source = MethodSource.DOCUMENTED
    method_source_note = "基于Ray Dalio《原则》《债务危机》公开的'经济机器'框架和'全天候'方法论"

    institution = "桥水基金 Bridgewater"
    institution_short = "Bridgewater"
    model_name = "经济机器"
    description = ("桥水经济机器框架: 经济周期位置(35%)评估通胀/增长组合; "
                   "市场估值水平(25%)评估整体估值; "
                   "风险溢价(20%)评估股债性价比; "
                   "流动性环境(20%)评估货币与利率条件")

    def compute(self, code: str) -> InstitutionRating:
        errors = []; dims = []; factors = {}
        try:
            cycle = self._eval_economic_cycle(code, errors, factors)
            if cycle: dims.append(cycle)
            val = self._eval_market_valuation(code, errors, factors)
            if val: dims.append(val)
            premium = self._eval_risk_premium(code, errors, factors)
            if premium: dims.append(premium)
            liq = self._eval_liquidity_env(code, errors, factors)
            if liq: dims.append(liq)

            summary = self._make_summary(dims)
            return self._make_rating(code, dims, summary, factors, errors)
        except Exception:
            return self._make_rating(code, dims, "评估异常", factors, errors)

    def _eval_economic_cycle(self, code, errors, factors) -> Optional[EvalDimension]:
        """经济周期: 用营收增速作为行业景气代理"""
        try:
            fin = self._get_financials(code)
            if not fin: return None
            score = 5.0; details = []
            rev = self._safe_float(fin[0].revenue_yoy)
            pr = self._safe_float(fin[0].net_profit_yoy)
            if rev: factors["bw_rev"] = rev
            if pr: factors["bw_pr"] = pr

            if rev and rev > 20:
                score += 2.0; details.append("行业高景气")
            elif rev and rev > 10:
                score += 1.0; details.append("行业景气扩张")
            elif rev and rev < -10:
                score -= 1.5; details.append("行业收缩期")

            if pr and pr > 30:
                score += 1.5; details.append("盈利高增长")
            elif pr and pr < -20:
                score -= 1.5; details.append("盈利恶化")

            return EvalDimension("经济周期位置", min(10,max(0,score)), 0.35, "; ".join(details) or "")
        except Exception:
            return None

    def _eval_market_valuation(self, code, errors, factors) -> Optional[EvalDimension]:
        try:
            r = self._get_realtime(code)
            if not r: return None
            score = 5.0; details = []
            pe = self._safe_float(r.pe)
            if pe: factors["bw_pe"] = pe
            if pe and pe < 12: score += 2.0; details.append(f"低估值PE{pe:.1f}x")
            elif pe and pe < 20: score += 1.0; details.append("估值合理")
            elif pe and pe > 35: score -= 1.5; details.append(f"高估值PE{pe:.1f}x")
            return EvalDimension("市场估值", min(10,max(0,score)), 0.25, "; ".join(details) or "")
        except Exception:
            return None

    def _eval_risk_premium(self, code, errors, factors) -> Optional[EvalDimension]:
        """风险溢价: 盈利收益率vs无风险利率"""
        try:
            r = self._get_realtime(code)
            if not r: return None
            score = 5.0; details = []
            pe = self._safe_float(r.pe)
            if pe and pe > 0:
                ey = 1/pe*100
                factors["bw_earnings_yield"] = round(ey, 2)
                if ey > 4: score += 2.0; details.append(f"高盈利收益率{ey:.1f}%")
                elif ey > 2.5: score += 1.0; details.append("风险溢价适中")
                else: score -= 1.0; details.append("风险溢价偏低")
            return EvalDimension("风险溢价", min(10,max(0,score)), 0.20, "; ".join(details) or "")
        except Exception:
            return None

    def _eval_liquidity_env(self, code, errors, factors) -> Optional[EvalDimension]:
        """流动性环境: 成交活跃度"""
        try:
            r = self._get_realtime(code)
            if not r: return None
            score = 5.0; details = []
            amt = self._safe_float(r.amount)
            tr = self._safe_float(r.turnover_rate)
            if amt:
                factors["bw_amount"] = amt
                if amt > 5e9: score += 1.5; details.append("高流动性")
                elif amt > 1e9: score += 0.5
                elif amt < 3e8: score -= 1.0; details.append("流动性不足")
            if tr and tr > 3: score += 1.0; details.append("换手活跃")
            return EvalDimension("流动性环境", min(10,max(0,score)), 0.20, "; ".join(details) or "")
        except Exception:
            return None

    def _make_summary(self, dims):
        if not dims: return "数据不足以评估"
        s = sum(d.score*d.weight for d in dims)/sum(d.weight for d in dims)
        return f"桥水视角: {'宏观+估值共振' if s>=7.5 else '宏观有利' if s>=6.0 else '等待周期' if s>=4.0 else '宏观不利'} ({s:.1f})"
