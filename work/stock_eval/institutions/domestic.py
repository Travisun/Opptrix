"""
国内机构评估模块 - 5家头部券商投研评级体系

########################################################################
源文件说明 - 透明性标注:

  国内券商的内部评估方法论不如国际投行透明,
  官方鲜少公开其评分模型的精确维度与权重。

  以下各机构的评估逻辑:
  [ok] 名称/研究方向可靠 - 这些券商确实使用多因子/多维评分体系
  [~] 具体维度和权重为合理构造 - 基于其公开发表的研究方向系统化实现
       (例如华泰金工组公开发布过多因子研报, 但内部因子权重不公开)

  所有维度和阈值均为工程化实现, 用于近似模拟该机构的投研风格,
  非其内部精确参数。
########################################################################

每家券商使用其公开的投研方法论:
  1. 中金公司 CICC      - 四维评分(成长/盈利能力/估值/质量) [方向可靠]
  2. 中信证券 CITIC     - 多维量化评分+行业基准 [方向可靠]
  3. 华泰证券 Huatai    - 多因子模型评分体系 [方向可靠]
  4. 招商证券 CMS       - 核心资产评分体系 [方向可靠]
  5. 国泰君安 GTJA     - CAPM+多因子模型 [方向可靠]
"""

from __future__ import annotations
from typing import Optional, List, Dict
import numpy as np

from .base import (
    InstitutionEvaluator, InstitutionRating,
    RatingLevel, EvalDimension, MethodSource,
)


# ═══════════════════════════════════════════════════════════════════
# 1. 中金公司 CICC — 四维评分体系
# ═══════════════════════════════════════════════════════════════════
# 四维: 成长性(30%) / 盈利能力(25%) / 估值(25%) / 质量(20%)

class CICCEvaluator(InstitutionEvaluator):
    """中金公司 — 多维评分 [来源: 研报风格]"""
    method_source = MethodSource.RESEARCH_STYLE
    method_source_note = "中金确实使用多维评分框架, 但'四维评分'非官方命名; 维度划分基于其研报风格构造"

    institution = "中金公司 CICC"
    institution_short = "CICC"
    model_name = "四维评分"
    description = "中金研究所四维框架: 成长性(30%)/盈利能力(25%)/估值水平(25%)/资产质量(20%)"

    def compute(self, code: str) -> InstitutionRating:
        errors = []
        dims: List[EvalDimension] = []
        factors: Dict[str, float] = {}
        try:
            g = self._eval_growth_cicc(code, errors, factors)
            if g: dims.append(g)
            p = self._eval_profitability(code, errors, factors)
            if p: dims.append(p)
            v = self._eval_valuation_cicc(code, errors, factors)
            if v: dims.append(v)
            q = self._eval_quality_cicc(code, errors, factors)
            if q: dims.append(q)

            summary = self._generate_summary(dims)
            return self._make_rating(code, dims, summary, factors, errors)
        except Exception as e:
            errors.append(f"CICC评估异常: {e}")
            return self._make_rating(code, dims, "评估出错", factors, errors)

    def _eval_growth_cicc(self, code, errors, factors) -> Optional[EvalDimension]:
        """成长性 30%"""
        try:
            fin = self._get_financials(code)
            if not fin: return None
            score = 5.0; details = []
            rev = self._safe_float(fin[0].revenue_yoy)
            pr = self._safe_float(fin[0].net_profit_yoy)
            if rev is not None:
                factors["cicc_rev_yoy"] = rev
                if rev > 25: score += 2.0; details.append(f"营收增{rev:.1f}%")
                elif rev > 10: score += 1.0
                elif rev < -10: score -= 1.5; details.append("营收下滑")
            if pr is not None:
                factors["cicc_profit_yoy"] = pr
                if pr > 30: score += 1.5; details.append(f"利润增{pr:.1f}%")
                elif pr < -20: score -= 1.5
            return EvalDimension("成长性", min(10, max(0, score)), 0.30,
                                 "; ".join(details) if details else "数据有限")
        except Exception:
            return None

    def _eval_profitability(self, code, errors, factors) -> Optional[EvalDimension]:
        """盈利能力 25%"""
        try:
            fin = self._get_financials(code)
            if not fin: return None
            score = 5.0; details = []
            roe = self._safe_float(fin[0].roe)
            gm = self._safe_float(fin[0].gross_margin)
            om = self._safe_float(fin[0].gross_margin)  # 没有单独运营利润率
            if roe:
                factors["cicc_roe"] = roe
                if roe > 20: score += 2.0; details.append(f"ROE {roe:.1f}% 优秀")
                elif roe > 15: score += 1.5
                elif roe > 10: score += 0.5
                elif roe < 5: score -= 1.5
            if gm:
                factors["cicc_gm"] = gm
                if gm > 60: score += 1.5; details.append(f"毛利率{gm:.1f}%")
                elif gm < 15: score -= 1.0; details.append("毛利率偏低")
            return EvalDimension("盈利能力", min(10, max(0, score)), 0.25,
                                 "; ".join(details) if details else "数据有限")
        except Exception:
            return None

    def _eval_valuation_cicc(self, code, errors, factors) -> Optional[EvalDimension]:
        """估值水平 25%"""
        try:
            r = self._get_realtime(code)
            if not r: return None
            score = 5.0; details = []
            pe = self._safe_float(r.pe)
            pb = self._safe_float(r.pb)
            if pe:
                factors["cicc_pe"] = pe
                if pe < 12: score += 2.0; details.append(f"PE {pe:.1f}x 低估")
                elif pe < 20: score += 1.0
                elif pe < 30: score += 0
                else: score -= 1.5; details.append(f"PE {pe:.1f}x 偏高")
            if pb and pb < 1:
                score += 1.5; details.append("破净")
            return EvalDimension("估值水平", min(10, max(0, score)), 0.25,
                                 "; ".join(details) if details else "数据有限")
        except Exception:
            return None

    def _eval_quality_cicc(self, code, errors, factors) -> Optional[EvalDimension]:
        """资产质量 20%"""
        try:
            fin = self._get_financials(code)
            if not fin: return None
            score = 5.0; details = []
            dr = self._safe_float(fin[0].debt_ratio)
            ocf = self._safe_float(fin[0].operating_cash_flow)
            npv = self._safe_float(fin[0].net_profit)
            if dr is not None:
                factors["cicc_debt"] = dr
                if dr < 30: score += 2.0; details.append(f"低负债{dr:.1f}%")
                elif dr < 50: score += 1.0
                elif dr > 70: score -= 1.5; details.append(f"高负债{dr:.1f}%")
            if ocf and npv and npv > 0:
                ratio = ocf / npv
                factors["cicc_ocf_np"] = round(ratio, 2)
                if ratio > 1: score += 1.0; details.append("覆盖力强")
            return EvalDimension("资产质量", min(10, max(0, score)), 0.20,
                                 "; ".join(details) if details else "数据有限")
        except Exception:
            return None

    def _generate_summary(self, dims: list) -> str:
        if not dims: return "数据不足以评估"
        s = sum(d.score * d.weight for d in dims) / sum(d.weight for d in dims)
        if s >= 7.5: return "中金四维高评分: 成长盈利质量估值全面优秀"
        elif s >= 6.0: return "中金评分良好: 大部分维度正面"
        elif s >= 4.0: return "中金评分中性: 部分维度有待改善"
        else: return "中金评分偏低: 多数维度偏弱"


# ═══════════════════════════════════════════════════════════════════
# 2. 中信证券 CITIC — 多维量化评分
# ═══════════════════════════════════════════════════════════════════
# 中信: 综合评分 = 基本面(30%)+估值(25%)+动量(20%)+市场情绪(15%)+风险(10%)

class CITICEvaluator(InstitutionEvaluator):
    """中信证券 — 多维量化评分 [来源: 研报风格]"""
    method_source = MethodSource.RESEARCH_STYLE
    method_source_note = "中信证券研究部量化组使用多因子评分框架, 具体维度为基于其公开发表方向构造"

    institution = "中信证券 CITIC"
    institution_short = "CITIC"
    model_name = "多维量化评分"
    description = "中信研究所多维框架: 基本面(30%)/估值(25%)/动量(20%)/市场情绪(15%)/风险(10%)"

    def compute(self, code: str) -> InstitutionRating:
        errors = []
        dims: List[EvalDimension] = []
        factors: Dict[str, float] = {}
        try:
            # 基本面30%
            fa = self._eval_fundamental(code, errors, factors)
            if fa: dims.append(fa)
            # 估值25%
            val = self._eval_citic_valuation(code, errors, factors)
            if val: dims.append(val)
            # 动量20%
            mom = self._eval_citic_momentum(code, errors, factors)
            if mom: dims.append(mom)
            # 市场情绪15%
            sent = self._eval_sentiment(code, errors, factors)
            if sent: dims.append(sent)
            # 风险10%
            risk = self._eval_citic_risk(code, errors, factors)
            if risk: dims.append(risk)

            summary = self._generate_summary(dims)
            return self._make_rating(code, dims, summary, factors, errors)
        except Exception as e:
            errors.append(f"CITIC评估异常: {e}")
            return self._make_rating(code, dims, "评估出错", factors, errors)

    def _eval_fundamental(self, code, errors, factors) -> Optional[EvalDimension]:
        try:
            fin = self._get_financials(code)
            if not fin: return None
            score = 5.0; details = []
            roe = self._safe_float(fin[0].roe)
            rev = self._safe_float(fin[0].revenue_yoy)
            pr = self._safe_float(fin[0].net_profit_yoy)
            if roe: factors["citic_roe"] = roe
            if roe and roe > 20: score += 1.5; details.append(f"ROE{roe:.1f}%")
            if rev and rev > 15: score += 1.0
            if pr and pr > 20: score += 1.0
            if (roe and roe < 5) or (rev and rev < -15): score -= 1.5
            return EvalDimension("基本面", min(10, max(0, score)), 0.30,
                                 "; ".join(details) if details else "")
        except Exception:
            return None

    def _eval_citic_valuation(self, code, errors, factors) -> Optional[EvalDimension]:
        try:
            r = self._get_realtime(code)
            if not r: return None
            score = 5.0; details = []
            pe = self._safe_float(r.pe)
            if pe:
                factors["citic_pe"] = pe
                if pe < 10: score += 2.5; details.append(f"深度价值PE{pe:.1f}")
                elif pe < 15: score += 1.5; details.append(f"PE{pe:.1f}偏低")
                elif pe < 25: score += 0.5
                else: score -= 1.5; details.append(f"PE{pe:.1f}偏高")
            return EvalDimension("估值水平", min(10, max(0, score)), 0.25,
                                 "; ".join(details) if details else "")
        except Exception:
            return None

    def _eval_citic_momentum(self, code, errors, factors) -> Optional[EvalDimension]:
        try:
            k = self._get_kline(code, count=120)
            if not k or len(k) < 60: return None
            score = 5.0; details = []
            closes = np.array([d.close for d in k])
            ret_3m = (closes[-1] / closes[-60] - 1) * 100
            ret_1m = (closes[-1] / closes[-20] - 1) * 100
            factors["citic_mom_3m"] = round(ret_3m, 2)
            factors["citic_mom_1m"] = round(ret_1m, 2)
            if ret_3m > 15: score += 2.0; details.append(f"3m涨{ret_3m:.1f}%")
            elif ret_3m > 5: score += 1.0
            elif ret_3m < -10: score -= 1.5; details.append("弱势")
            if ret_1m > 0 and ret_3m > 0: score += 0.5; details.append("趋势向上")
            return EvalDimension("动量趋势", min(10, max(0, score)), 0.20,
                                 "; ".join(details) if details else "")
        except Exception:
            return None

    def _eval_sentiment(self, code, errors, factors) -> Optional[EvalDimension]:
        """市场情绪 — 量能 + 换手率"""
        try:
            r = self._get_realtime(code)
            if not r: return None
            score = 5.0; details = []
            tr = self._safe_float(r.turnover_rate)
            vr = self._safe_float(r.volume_ratio)
            if tr: factors["citic_tr"] = tr
            if vr: factors["citic_vr"] = vr
            if tr and tr > 5: score += 1.0; details.append("换手活跃")
            elif tr and tr < 0.5: score -= 0.5
            if vr and vr > 1.5: score += 1.0; details.append("量比放大")
            return EvalDimension("市场情绪", min(10, max(0, score)), 0.15,
                                 "; ".join(details) if details else "")
        except Exception:
            return None

    def _eval_citic_risk(self, code, errors, factors) -> Optional[EvalDimension]:
        try:
            k = self._get_kline(code, count=120)
            fin = self._get_financials(code)
            score = 5.0; details = []
            if k and len(k) >= 60:
                closes = np.array([d.close for d in k])
                rets = np.diff(closes) / closes[:-1]
                vol = np.std(rets) * np.sqrt(252) * 100
                factors["citic_vol"] = round(vol, 2)
                if vol < 25: score += 1.5; details.append(f"低波动{vol:.1f}%")
                elif vol > 50: score -= 1.5; details.append(f"高波动{vol:.1f}%")
            if fin:
                dr = self._safe_float(fin[0].debt_ratio)
                if dr and dr > 70: score -= 1.0; details.append("高负债")
            return EvalDimension("风险评估", min(10, max(0, score)), 0.10,
                                 "; ".join(details) if details else "")
        except Exception:
            return None

    def _generate_summary(self, dims: list) -> str:
        if not dims: return "数据不足以评估"
        s = sum(d.score * d.weight for d in dims) / sum(d.weight for d in dims)
        if s >= 7.5: return "中信多维评分强烈看好"
        elif s >= 6.0: return "中信多维评分正面"
        elif s >= 4.0: return "中信多维评分中性"
        else: return "中信多维评分负面"


# ═══════════════════════════════════════════════════════════════════
# 3. 华泰证券 Huatai — 多因子模型
# ═══════════════════════════════════════════════════════════════════
# 华泰: 综合Alpha = 0.3*价值 + 0.25*质量 + 0.20*成长 + 0.15*一致预期 + 0.10*技术

class HuataiEvaluator(InstitutionEvaluator):
    """华泰证券 — 多因子模型 [来源: 研报风格]"""
    method_source = MethodSource.RESEARCH_STYLE
    method_source_note = "华泰金工组是国内量化标杆, 公开发表过多因子系列研报; 框架基于其公开方法论"

    institution = "华泰证券 Huatai"
    institution_short = "Huatai"
    model_name = "多因子模型"
    description = "华泰多因子: 价值(30%)/质量(25%)/成长(20%)/一致预期(15%)/技术(10%)"

    def compute(self, code: str) -> InstitutionRating:
        errors = []
        dims: List[EvalDimension] = []
        factors: Dict[str, float] = {}
        try:
            v = self._eval_val(code, errors, factors)
            if v: dims.append(v)
            q = self._eval_q(code, errors, factors)
            if q: dims.append(q)
            g = self._eval_g(code, errors, factors)
            if g: dims.append(g)
            exp = self._eval_expectation(code, errors, factors)
            if exp: dims.append(exp)
            tech = self._eval_tech(code, errors, factors)
            if tech: dims.append(tech)

            summary = self._generate_summary(dims)
            return self._make_rating(code, dims, summary, factors, errors)
        except Exception:
            errors.append("华泰评估异常")
            return self._make_rating(code, dims, "评估出错", factors, errors)

    def _eval_val(self, code, errors, factors):
        try:
            r = self._get_realtime(code)
            if not r: return None
            score = 5.0; pe = self._safe_float(r.pe)
            if pe and pe < 12: score += 2.5; details = f"PE{pe:.1f}"
            elif pe and pe < 18: score += 1.5
            elif pe and pe > 35: score -= 1.5
            else: details = ""
            return EvalDimension("价值因子", min(10, max(0, score)), 0.30, details)
        except Exception:
            return None

    def _eval_q(self, code, errors, factors):
        try:
            fin = self._get_financials(code)
            if not fin: return None
            score = 5.0; details = []
            roe = self._safe_float(fin[0].roe)
            if roe:
                factors["ht_roe"] = roe
                if roe > 20: score += 2.0; details.append(f"ROE{roe:.1f}%")
                elif roe > 15: score += 1.5
                elif roe < 5: score -= 1.5
            gm = self._safe_float(fin[0].gross_margin)
            if gm and gm > 60: score += 1.0
            return EvalDimension("质量因子", min(10, max(0, score)), 0.25,
                                 "; ".join(details) if details else "")
        except Exception:
            return None

    def _eval_g(self, code, errors, factors):
        try:
            fin = self._get_financials(code)
            if not fin: return None
            score = 5.0
            rev = self._safe_float(fin[0].revenue_yoy)
            if rev and rev > 20: score += 2.5
            elif rev and rev > 10: score += 1.5
            elif rev and rev < -10: score -= 1.5
            return EvalDimension("成长因子", min(10, max(0, score)), 0.20, f"营收YoY={rev}")
        except Exception:
            return None

    def _eval_expectation(self, code, errors, factors):
        """一致预期 — 动量代理"""
        try:
            k = self._get_kline(code, count=60)
            if not k or len(k) < 20: return None
            score = 5.0
            closes = np.array([d.close for d in k])
            ret_1m = (closes[-1] / closes[-20] - 1) * 100
            if ret_1m > 10: score += 2.0
            elif ret_1m > 5: score += 1.0
            elif ret_1m < -8: score -= 1.5
            return EvalDimension("一致预期", min(10, max(0, score)), 0.15, f"1m={ret_1m:.1f}%")
        except Exception:
            return None

    def _eval_tech(self, code, errors, factors):
        try:
            k = self._get_kline(code, count=60)
            if not k or len(k) < 60: return None
            score = 5.0
            closes = np.array([d.close for d in k])
            ma60 = np.mean(closes)
            curr = closes[-1]
            pct = (curr - ma60) / ma60 * 100
            factors["ht_ma60_pct"] = round(pct, 2)
            if -5 < pct < 5: score += 2.0; details = f"MA60附近{pct:+.1f}%"
            elif -10 < pct < 10: score += 1.0
            else: score -= 1.0; details = f"偏离MA60{pct:+.1f}%"
            return EvalDimension("技术因子", min(10, max(0, score)), 0.10, details)
        except Exception:
            return None

    def _generate_summary(self, dims: list) -> str:
        if not dims: return "数据不足以评估"
        s = sum(d.score * d.weight for d in dims) / sum(d.weight for d in dims)
        if s >= 7.5: return "华泰多因子高评分"
        elif s >= 6.0: return "华泰多因子正面"
        elif s >= 4.0: return "华泰多因子中性"
        else: return "华泰多因子负面"


# ═══════════════════════════════════════════════════════════════════
# 4. 招商证券 CMS — 核心资产评分体系
# ═══════════════════════════════════════════════════════════════════
# 招商: 护城河(30%)+成长(25%)+财务健康(25%)+估值(20%)

class CMSEvaluator(InstitutionEvaluator):
    """招商证券 — 核心资产评分 [来源: 研报风格]"""
    method_source = MethodSource.RESEARCH_STYLE
    method_source_note = "招商证券近年聚焦核心资产研究, '核心资产评分'非官方命名"

    institution = "招商证券 CMS"
    institution_short = "CMS"
    model_name = "核心资产评分"
    description = "招商核心资产框架: 护城河(30%)/成长(25%)/财务健康(25%)/估值(20%)"

    def compute(self, code: str) -> InstitutionRating:
        errors = []
        dims: List[EvalDimension] = []
        factors: Dict[str, float] = {}
        try:
            m = self._eval_moat(code, errors, factors)
            if m: dims.append(m)
            g = self._eval_cms_growth(code, errors, factors)
            if g: dims.append(g)
            h = self._eval_health(code, errors, factors)
            if h: dims.append(h)
            v = self._eval_cms_valuation(code, errors, factors)
            if v: dims.append(v)

            summary = self._generate_summary(dims)
            return self._make_rating(code, dims, summary, factors, errors)
        except Exception:
            return self._make_rating(code, dims, "评估出错", factors, errors)

    def _eval_moat(self, code, errors, factors) -> Optional[EvalDimension]:
        """护城河 — 高毛利+高ROE+大市值为代理"""
        try:
            fin = self._get_financials(code)
            r = self._get_realtime(code)
            score = 5.0; details = []
            if fin:
                gm = self._safe_float(fin[0].gross_margin)
                roe = self._safe_float(fin[0].roe)
                if gm and gm > 60: score += 1.5; details.append(f"毛利率{gm:.1f}%")
                elif gm and gm < 20: score -= 1.0
                if roe and roe > 20: score += 1.5; details.append(f"ROE{roe:.1f}%")
                elif roe and roe < 5: score -= 1.0
            if r:
                mc = self._safe_float(r.market_cap)
                if mc and mc > 1e11: score += 1.0; details.append("大市值龙头")
            return EvalDimension("护城河", min(10, max(0, score)), 0.30,
                                 "; ".join(details) if details else "")
        except Exception:
            return None

    def _eval_cms_growth(self, code, errors, factors) -> Optional[EvalDimension]:
        try:
            fin = self._get_financials(code)
            if not fin: return None
            score = 5.0; details = []
            rev = self._safe_float(fin[0].revenue_yoy)
            pr = self._safe_float(fin[0].net_profit_yoy)
            if rev: factors["cms_rev"] = rev
            if pr: factors["cms_pr"] = pr
            if rev and rev > 20: score += 1.5; details.append(f"营收+{rev:.1f}%")
            elif rev and rev > 10: score += 1.0
            elif rev and rev < -10: score -= 1.5
            if pr and pr > 20: score += 1.5
            elif pr and pr < -15: score -= 1.5
            return EvalDimension("成长性", min(10, max(0, score)), 0.25,
                                 "; ".join(details) if details else "")
        except Exception:
            return None

    def _eval_health(self, code, errors, factors) -> Optional[EvalDimension]:
        try:
            fin = self._get_financials(code)
            if not fin: return None
            score = 5.0; details = []
            dr = self._safe_float(fin[0].debt_ratio)
            ocf = self._safe_float(fin[0].operating_cash_flow)
            npv = self._safe_float(fin[0].net_profit)
            if dr is not None:
                factors["cms_debt"] = dr
                if dr < 30: score += 2.0; details.append(f"低负债{dr:.1f}%")
                elif dr < 50: score += 1.0
                elif dr > 70: score -= 1.5
            if ocf and npv and ocf > 0 and npv > 0 and ocf > npv:
                score += 1.0; details.append("现金覆盖利润")
            return EvalDimension("财务健康", min(10, max(0, score)), 0.25,
                                 "; ".join(details) if details else "")
        except Exception:
            return None

    def _eval_cms_valuation(self, code, errors, factors) -> Optional[EvalDimension]:
        try:
            r = self._get_realtime(code)
            if not r: return None
            score = 5.0; details = []
            pe = self._safe_float(r.pe)
            if pe:
                factors["cms_pe"] = pe
                if pe < 10: score += 2.5; details.append(f"PE{pe:.1f}x低估")
                elif pe < 15: score += 1.5
                elif pe < 25: score += 0.5
                else: score -= 1.5
            return EvalDimension("估值水平", min(10, max(0, score)), 0.20,
                                 "; ".join(details) if details else "")
        except Exception:
            return None

    def _generate_summary(self, dims: list) -> str:
        if not dims: return "数据不足以评估"
        s = sum(d.score * d.weight for d in dims) / sum(d.weight for d in dims)
        if s >= 7.5: return "招商核心资产高评分: 护城河深+财务健康"
        elif s >= 6.0: return "招商评分正面: 核心资产属性良好"
        elif s >= 4.0: return "招商评分中性: 核心资产特征不突出"
        else: return "招商评分偏低: 核心资产质量不足"


# ═══════════════════════════════════════════════════════════════════
# 5. 国泰君安 Guotai Junan — CAPM+多因子
# ═══════════════════════════════════════════════════════════════════

class GuotaiJunanEvaluator(InstitutionEvaluator):
    """国泰君安 — CAPM+多因子 [来源: 研报风格]"""
    method_source = MethodSource.RESEARCH_STYLE
    method_source_note = "国君研究所公开发表过CAPM和多因子相关研报, 框架为基于其研究方向的合理构造"

    institution = "国泰君安 Guotai Junan"
    institution_short = "Guotai Junan"
    model_name = "CAPM+多因子"
    description = "国君模型: 超额收益(40%)/估值(20%)/质量(20%)/技术(20%)"

    def compute(self, code: str) -> InstitutionRating:
        errors = []
        dims: List[EvalDimension] = []
        factors: Dict[str, float] = {}
        try:
            alpha = self._eval_excess_return(code, errors, factors)
            if alpha: dims.append(alpha)
            val = self._eval_gtja_valuation(code, errors, factors)
            if val: dims.append(val)
            q = self._eval_gtja_quality(code, errors, factors)
            if q: dims.append(q)
            tech = self._eval_gtja_technical(code, errors, factors)
            if tech: dims.append(tech)

            summary = self._generate_summary(dims)
            return self._make_rating(code, dims, summary, factors, errors)
        except Exception:
            return self._make_rating(code, dims, "评估出错", factors, errors)

    def _eval_excess_return(self, code, errors, factors) -> Optional[EvalDimension]:
        try:
            k = self._get_kline(code, count=250)
            if not k or len(k) < 60: return None
            closes = np.array([d.close for d in k])
            ret_1y = (closes[-1] / closes[0] - 1) * 100
            try:
                idx = self._de.index_kline("000300", "daily", count=250)
                idx_ret = 0
                if idx and idx.success and idx.data and len(idx.data) >= 2:
                    idx_closes = np.array([d.close for d in idx.data])
                    idx_ret = (idx_closes[-1] / idx_closes[0] - 1) * 100
                alpha = ret_1y - idx_ret
                factors["gtja_alpha_1y"] = round(alpha, 2)
                score = 5.0 + alpha / 5
                return EvalDimension("超额收益α", min(10, max(0, score)), 0.40,
                                     f"α={alpha:+.1f}%")
            except Exception:
                return None
        except Exception:
            return None

    def _eval_gtja_valuation(self, code, errors, factors) -> Optional[EvalDimension]:
        try:
            r = self._get_realtime(code)
            if not r: return None
            score = 5.0
            pe = self._safe_float(r.pe)
            if pe and pe < 12: score += 2.5
            elif pe and pe < 20: score += 1.0
            elif pe and pe > 40: score -= 1.5
            return EvalDimension("估值", min(10, max(0, score)), 0.20, f"PE={pe}")
        except Exception:
            return None

    def _eval_gtja_quality(self, code, errors, factors) -> Optional[EvalDimension]:
        try:
            fin = self._get_financials(code)
            if not fin: return None
            score = 5.0
            roe = self._safe_float(fin[0].roe)
            if roe: factors["gtja_roe"] = roe
            if roe and roe > 20: score += 2.5
            elif roe and roe > 15: score += 1.5
            elif roe and roe < 5: score -= 1.5
            return EvalDimension("质量", min(10, max(0, score)), 0.20, f"ROE={roe}")
        except Exception:
            return None

    def _eval_gtja_technical(self, code, errors, factors) -> Optional[EvalDimension]:
        try:
            k = self._get_kline(code, count=60)
            if not k or len(k) < 60: return None
            score = 5.0
            closes = np.array([d.close for d in k])
            ma20 = np.mean(closes[-20:])
            ma60 = np.mean(closes)
            curr = closes[-1]
            if curr > ma20 > ma60: score += 2.5; details = "多头排列"
            elif curr > ma60: score += 1.0; details = "均线上方"
            elif curr < ma20 < ma60: score -= 1.5; details = "空头排列"
            else: score += 0; details = "震荡"
            return EvalDimension("技术面", min(10, max(0, score)), 0.20, details)
        except Exception:
            return None

    def _generate_summary(self, dims: list) -> str:
        if not dims: return "数据不足以评估"
        s = sum(d.score * d.weight for d in dims) / sum(d.weight for d in dims)
        if s >= 7.5: return "国君评分强烈看好: 超额+质量+技术共振"
        elif s >= 6.0: return "国君评分正面"
        elif s >= 4.0: return "国君评分中性"
        else: return "国君评分负面"
