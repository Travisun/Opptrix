"""
国家队机构评估模块 — 4类国家资金的投资偏好与评估逻辑

覆盖:
  1. 社保基金       — 长期价值投资/高股息/稳定/战略行业
  2. 中央汇金       — 系统重要性/金融权重/高分红
  3. 证金公司       — 市场稳定器/蓝筹/低估值
  4. 国家大基金     — 半导体/集成电路/硬科技战略
"""

from __future__ import annotations
from typing import Optional, List, Dict
import numpy as np

from .base import (
    InstitutionEvaluator, InstitutionRating,
    RatingLevel, EvalDimension,
)


# ═══════════════════════════════════════════════════════════════════
# 1. 社保基金 — 长期价值投资
# ═══════════════════════════════════════════════════════════════════
# 核心逻辑: 低风险偏好(权益≤40%) / 高股息 / 低波动 / 长期ROE稳定 / 国家队/央企偏好

class SocialSecurityEvaluator(InstitutionEvaluator):
    """社保基金 — 长期价值投资评估"""

    institution = "社保基金 Social Security"
    institution_short = "社保基金"
    model_name = "社保偏好模型"
    description = ("社保基金投资偏好: 高股息(30%)/低波动(25%)/稳定ROE(20%)"
                   "/低估值(15%)/大市值流动性(10%)")

    def compute(self, code: str) -> InstitutionRating:
        errors = []
        dims: List[EvalDimension] = []
        factors: Dict[str, float] = {}
        try:
            div = self._eval_dividend(code, errors, factors)
            if div: dims.append(div)
            vol = self._eval_low_vol_ssf(code, errors, factors)
            if vol: dims.append(vol)
            roe = self._eval_stable_roe(code, errors, factors)
            if roe: dims.append(roe)
            val = self._eval_ssf_valuation(code, errors, factors)
            if val: dims.append(val)
            liq = self._eval_liquidity(code, errors, factors)
            if liq: dims.append(liq)

            summary = self._generate_summary(dims)
            return self._make_rating(code, dims, summary, factors, errors)
        except Exception as e:
            errors.append(f"社保评估异常: {e}")
            return self._make_rating(code, dims, "评估出错", factors, errors)

    def _eval_dividend(self, code, errors, factors) -> Optional[EvalDimension]:
        """高股息偏好 30%"""
        try:
            r = self._get_realtime(code)
            fin = self._get_financials(code)
            if not r or not fin: return None
            score = 5.0; details = []
            pe = self._safe_float(r.pe)
            if pe and pe > 0:
                # 用PE倒数 + ROE估算股息潜力
                roe = self._safe_float(fin[0].roe)
                if roe:
                    implied_dy = roe / pe
                    factors["ssf_implied_dy"] = round(implied_dy, 2)
                    if implied_dy > 3:
                        score += 3.0; details.append(f"股息潜力{implied_dy:.1f}%")
                    elif implied_dy > 2:
                        score += 1.5; details.append(f"股息潜力{implied_dy:.1f}%良好")
                    elif implied_dy < 0.5:
                        score -= 1.5; details.append("股息潜力不足")
            return EvalDimension("高股息偏好", min(10, max(0, score)), 0.30,
                                 "; ".join(details) if details else "")
        except Exception:
            return None

    def _eval_low_vol_ssf(self, code, errors, factors) -> Optional[EvalDimension]:
        """低波动偏好 25%"""
        try:
            k = self._get_kline(code, count=250)
            if not k or len(k) < 60: return None
            score = 5.0; details = []
            closes = np.array([d.close for d in k])
            rets = np.diff(closes) / closes[:-1]
            vol = np.std(rets) * np.sqrt(252) * 100
            factors["ssf_vol"] = round(vol, 2)
            if vol < 20:
                score += 2.5; details.append(f"极低波动{vol:.1f}%")
            elif vol < 30:
                score += 1.5; details.append(f"低波动{vol:.1f}%")
            elif vol < 40:
                score += 0.5
            else:
                score -= 1.5; details.append(f"波动偏高{vol:.1f}%")

            # 最大回撤
            peak = np.maximum.accumulate(closes)
            dd = (closes - peak) / peak
            mdd = float(np.min(dd) * 100)
            factors["ssf_mdd"] = round(mdd, 2)
            if mdd > -10: score += 1.0; details.append(f"回撤极小{mdd:.1f}%")
            elif mdd < -30: score -= 1.0

            return EvalDimension("低波动偏好", min(10, max(0, score)), 0.25,
                                 "; ".join(details) if details else "")
        except Exception:
            return None

    def _eval_stable_roe(self, code, errors, factors) -> Optional[EvalDimension]:
        """稳定ROE 20%"""
        try:
            fin = self._get_financials(code)
            if not fin or len(fin) < 3: return None
            score = 5.0; details = []
            roes = [self._safe_float(f.roe) for f in fin[:4] if f.roe]
            roes = [r for r in roes if r is not None]
            if len(roes) >= 3:
                avg_roe = np.mean(roes)
                roe_vol = np.std(roes)
                factors["ssf_avg_roe"] = round(avg_roe, 2)
                factors["ssf_roe_vol"] = round(roe_vol, 2)
                if avg_roe > 15 and roe_vol < 3:
                    score += 3.0; details.append(f"ROE{avg_roe:.1f}%稳定(σ={roe_vol:.1f})")
                elif avg_roe > 12:
                    score += 1.5; details.append(f"ROE{avg_roe:.1f}%尚可")
                elif avg_roe < 5:
                    score -= 1.5; details.append("ROE偏低")
            return EvalDimension("稳定ROE", min(10, max(0, score)), 0.20,
                                 "; ".join(details) if details else "")
        except Exception:
            return None

    def _eval_ssf_valuation(self, code, errors, factors) -> Optional[EvalDimension]:
        """低估值偏好 15%"""
        try:
            r = self._get_realtime(code)
            if not r: return None
            score = 5.0
            pe = self._safe_float(r.pe)
            pb = self._safe_float(r.pb)
            if pe:
                factors["ssf_pe"] = pe
                if pe < 10: score += 2.5
                elif pe < 15: score += 1.5
                elif pe > 30: score -= 1.5
            if pb and pb < 1: score += 1.0
            return EvalDimension("低估值偏好", min(10, max(0, score)), 0.15,
                                 f"PE={pe}" if pe else "")
        except Exception:
            return None

    def _eval_liquidity(self, code, errors, factors) -> Optional[EvalDimension]:
        """大盘流动性 10%"""
        try:
            r = self._get_realtime(code)
            if not r: return None
            score = 5.0; details = []
            mc = self._safe_float(r.market_cap)
            amt = self._safe_float(r.amount)
            if mc:
                factors["ssf_mc"] = mc
                if mc > 5e11: score += 2.5; details.append("超大盘")
                elif mc > 1e11: score += 1.5; details.append("大盘蓝筹")
                elif mc > 2e10: score += 0.5
                else: score -= 1.0; details.append("小盘流动性差")
            if amt and amt > 5e9: score += 1.0
            return EvalDimension("大市值流动性", min(10, max(0, score)), 0.10,
                                 "; ".join(details) if details else "")
        except Exception:
            return None

    def _generate_summary(self, dims: list) -> str:
        if not dims: return "数据不足以评估"
        s = sum(d.score * d.weight for d in dims) / sum(d.weight for d in dims)
        if s >= 7.5: return "社保偏好匹配度高: 高股息+低波动+稳定ROE"
        elif s >= 6.0: return "社保偏好匹配: 多数维度符合社保选股标准"
        elif s >= 4.0: return "社保偏好部分匹配"
        else: return "社保偏好不匹配"


# ═══════════════════════════════════════════════════════════════════
# 2. 中央汇金 Huijin — 国家金融稳定/战略持股
# ═══════════════════════════════════════════════════════════════════
# 偏好: 金融权重/央企控股/高分红/系统重要性/超大市值

class HuijinEvaluator(InstitutionEvaluator):
    """中央汇金 — 国家金融稳定评估"""

    institution = "中央汇金 Central Huijin"
    institution_short = "中央汇金"
    model_name = "汇金偏好模型"
    description = "汇金投资偏好: 系统重要性(40%)/高分红(25%)/央企背景(20%)/绝对低估值(15%)"

    def compute(self, code: str) -> InstitutionRating:
        errors = []
        dims: List[EvalDimension] = []
        factors: Dict[str, float] = {}
        try:
            sys_imp = self._eval_systemic_importance(code, errors, factors)
            if sys_imp: dims.append(sys_imp)
            div = self._eval_huijin_dividend(code, errors, factors)
            if div: dims.append(div)
            state = self._eval_state_background(code, errors, factors)
            if state: dims.append(state)
            val = self._eval_huijin_valuation(code, errors, factors)
            if val: dims.append(val)

            summary = self._generate_summary(dims)
            return self._make_rating(code, dims, summary, factors, errors)
        except Exception:
            return self._make_rating(code, dims, "评估出错", factors, errors)

    def _eval_systemic_importance(self, code, errors, factors) -> Optional[EvalDimension]:
        """系统重要性 40%"""
        try:
            r = self._get_realtime(code)
            if not r: return None
            score = 5.0; details = []
            mc = self._safe_float(r.market_cap)
            if mc:
                factors["huijin_mc"] = mc
                if mc > 1e12:
                    score = 9.0; details.append("万亿市值系统重要")
                elif mc > 5e11:
                    score = 8.0; details.append("超大盘系统重要")
                elif mc > 1e11:
                    score = 6.5; details.append("大盘蓝筹")
                elif mc > 5e10:
                    score = 5.0
                else:
                    score = 3.0; details.append("非汇金偏好规模")
            tr = self._safe_float(r.turnover_rate)
            if tr and tr < 2:
                score += 0.5; details.append("低换手稳定")
            return EvalDimension("系统重要性", min(10, max(0, score)), 0.40,
                                 "; ".join(details) if details else "")
        except Exception:
            return None

    def _eval_huijin_dividend(self, code, errors, factors) -> Optional[EvalDimension]:
        """高分红 25%"""
        try:
            r = self._get_realtime(code)
            if not r: return None
            score = 5.0
            pe = self._safe_float(r.pe)
            if pe and pe > 0:
                implied_dy = 1 / pe * 100
                factors["huijin_implied_dy"] = round(implied_dy, 2)
                if implied_dy > 4: score += 3.0; details = f"高息{implied_dy:.1f}%"
                elif implied_dy > 2.5: score += 1.5
                elif implied_dy < 1: score -= 1.5; details = "低息"
                else: details = ""
                return EvalDimension("高分红", min(10, max(0, score)), 0.25, details)
            return None
        except Exception:
            return None

    def _eval_state_background(self, code, errors, factors) -> Optional[EvalDimension]:
        """央企/国资背景 20%"""
        try:
            score = 5.0
            r = self._get_realtime(code)
            if r:
                mc = self._safe_float(r.market_cap)
                pe = self._safe_float(r.pe)
                # 大市值+低PE作为央企代理
                if mc and mc > 5e11 and pe and pe < 12:
                    score += 3.0
                elif mc and mc > 1e11:
                    score += 1.5
            return EvalDimension("央企/国资背景", min(10, max(0, score)), 0.20, "")
        except Exception:
            return None

    def _eval_huijin_valuation(self, code, errors, factors) -> Optional[EvalDimension]:
        try:
            r = self._get_realtime(code)
            if not r: return None
            score = 5.0
            pe = self._safe_float(r.pe)
            pb = self._safe_float(r.pb)
            if pe and pe < 8: score += 3.0
            elif pe and pe < 12: score += 1.5
            elif pe and pe > 20: score -= 1.5
            if pb and pb < 1: score += 1.0
            return EvalDimension("绝对低估值", min(10, max(0, score)), 0.15, f"PE={pe}")
        except Exception:
            return None

    def _generate_summary(self, dims: list) -> str:
        if not dims: return "数据不足以评估"
        s = sum(d.score * d.weight for d in dims) / sum(d.weight for d in dims)
        if s >= 7.5: return "汇金标准高度匹配: 系统重要+央企+高分红"
        elif s >= 6.0: return "汇金标准匹配: 具备战略重要性"
        elif s >= 4.0: return "汇金标准部分匹配"
        else: return "非汇金典型持仓特征"


# ═══════════════════════════════════════════════════════════════════
# 3. 证金公司 CSF — 市场稳定器
# ═══════════════════════════════════════════════════════════════════
# 偏好: 超低估值/超大市值/金融蓝筹/高流动性/低波动

class CSFEvaluator(InstitutionEvaluator):
    """证金公司 — 市场稳定器"""

    institution = "证金公司 CSF"
    institution_short = "证金"
    model_name = "证金偏好模型"
    description = "证金偏好: 超低估值(30%)/超大市值(25%)/低波动(20%)/高流动性(15%)/金融蓝筹(10%)"

    def compute(self, code: str) -> InstitutionRating:
        errors = []
        dims: List[EvalDimension] = []
        factors: Dict[str, float] = {}
        try:
            v = self._eval_csf_value(code, errors, factors)
            if v: dims.append(v)
            mc = self._eval_csf_size(code, errors, factors)
            if mc: dims.append(mc)
            lv = self._eval_csf_lowvol(code, errors, factors)
            if lv: dims.append(lv)
            liq = self._eval_csf_liquidity(code, errors, factors)
            if liq: dims.append(liq)

            summary = self._generate_summary(dims)
            return self._make_rating(code, dims, summary, factors, errors)
        except Exception:
            return self._make_rating(code, dims, "评估出错", factors, errors)

    def _eval_csf_value(self, code, errors, factors) -> Optional[EvalDimension]:
        try:
            r = self._get_realtime(code)
            if not r: return None
            score = 5.0
            pe = self._safe_float(r.pe)
            pb = self._safe_float(r.pb)
            if pe:
                factors["csf_pe"] = pe
                if pe < 8: score += 3.5; details = f"超低PE{pe:.1f}x"
                elif pe < 12: score += 2.5; details = f"低PE{pe:.1f}x"
                elif pe < 18: score += 1.0
                else: score -= 1.0; details = f"PE{pe:.1f}x偏高"
            if pb and pb < 1: score += 1.0
            return EvalDimension("超低估值", min(10, max(0, score)), 0.30, details or "")
        except Exception:
            return None

    def _eval_csf_size(self, code, errors, factors) -> Optional[EvalDimension]:
        try:
            r = self._get_realtime(code)
            if not r: return None
            mc = self._safe_float(r.market_cap)
            if mc:
                factors["csf_mc"] = mc
                if mc > 1e12: return EvalDimension("超大市值", 9.5, 0.25, "万亿级")
                elif mc > 5e11: return EvalDimension("超大市值", 8.5, 0.25, "超大盘")
                elif mc > 1e11: return EvalDimension("超大市值", 7.0, 0.25, "大盘")
                elif mc > 5e10: return EvalDimension("超大市值", 5.0, 0.25, "中大盘")
            return None
        except Exception:
            return None

    def _eval_csf_lowvol(self, code, errors, factors) -> Optional[EvalDimension]:
        try:
            k = self._get_kline(code, count=120)
            if not k or len(k) < 60: return None
            score = 5.0
            closes = np.array([d.close for d in k])
            rets = np.diff(closes) / closes[:-1]
            vol = np.std(rets) * np.sqrt(252) * 100
            factors["csf_vol"] = round(vol, 2)
            if vol < 20: score += 3.0; details = f"极低波{vol:.1f}%"
            elif vol < 30: score += 2.0; details = f"低波{vol:.1f}%"
            elif vol > 45: score -= 1.5; details = f"高波{vol:.1f}%"
            else: details = ""
            return EvalDimension("低波动", min(10, max(0, score)), 0.20, details)
        except Exception:
            return None

    def _eval_csf_liquidity(self, code, errors, factors) -> Optional[EvalDimension]:
        try:
            r = self._get_realtime(code)
            if not r: return None
            score = 5.0
            amt = self._safe_float(r.amount)
            tr = self._safe_float(r.turnover_rate)
            if amt:
                factors["csf_amount"] = amt
                if amt > 1e10: score += 3.0
                elif amt > 3e9: score += 1.5
                elif amt < 5e8: score -= 1.0
            if tr and tr > 3: score += 1.0
            return EvalDimension("高流动性", min(10, max(0, score)), 0.15, "")
        except Exception:
            return None

    def _generate_summary(self, dims: list) -> str:
        if not dims: return "数据不足以评估"
        s = sum(d.score * d.weight for d in dims) / sum(d.weight for d in dims)
        if s >= 7.5: return "证金标准高匹配: 超低估值+超大市值稳定器"
        elif s >= 6.0: return "证金标准匹配: 具备护盘价值"
        elif s >= 4.0: return "证金标准部分匹配"
        else: return "非证金偏好标的"


# ═══════════════════════════════════════════════════════════════════
# 4. 国家大基金 BigFund — 集成电路/半导体战略投资
# ═══════════════════════════════════════════════════════════════════
# 偏好: 半导体产业链/高研发投入/高毛利/技术壁垒/国产替代

class BigFundEvaluator(InstitutionEvaluator):
    """国家大基金 — 半导体/集成电路战略投资评估"""

    institution = "国家大基金 Big Fund"
    institution_short = "国家大基金"
    model_name = "大基金偏好模型"
    description = ("大基金投资偏好: 研发强度(30%)/技术壁垒(25%)/毛利率(20%)"
                   "/营收成长(15%)/国产替代潜力(10%)")

    def compute(self, code: str) -> InstitutionRating:
        errors = []
        dims: List[EvalDimension] = []
        factors: Dict[str, float] = {}
        try:
            rd = self._eval_rd_intensity(code, errors, factors)
            if rd: dims.append(rd)
            gm = self._eval_tech_moat(code, errors, factors)
            if gm: dims.append(gm)
            rev = self._eval_revenue_growth(code, errors, factors)
            if rev: dims.append(rev)
            val = self._eval_bigfund_valuation(code, errors, factors)
            if val: dims.append(val)

            summary = "大基金偏好评估完成 (数据引擎不支持研发投入明细，使用毛利率+营收增速代理)"
            return self._make_rating(code, dims, summary, factors, errors)
        except Exception:
            return self._make_rating(code, dims, "评估出错", factors, errors)

    def _eval_rd_intensity(self, code, errors, factors) -> Optional[EvalDimension]:
        """研发强度代理 — 高毛利作为技术溢价代理"""
        try:
            fin = self._get_financials(code)
            if not fin: return None
            score = 5.0; details = []
            gm = self._safe_float(fin[0].gross_margin)
            if gm:
                factors["bigfund_gm"] = gm
                if gm > 60: score += 3.0; details.append(f"高毛利{gm:.1f}%预示高壁垒")
                elif gm > 40: score += 1.5; details.append(f"毛利率{gm:.1f}%尚可")
                elif gm < 20: score -= 1.5; details.append("低毛利非技术壁垒型")
            return EvalDimension("研发强度(代理)", min(10, max(0, score)), 0.30,
                                 "; ".join(details) if details else "")
        except Exception:
            return None

    def _eval_tech_moat(self, code, errors, factors) -> Optional[EvalDimension]:
        """技术壁垒 25%"""
        try:
            fin = self._get_financials(code)
            if not fin: return None
            score = 5.0
            gm = self._safe_float(fin[0].gross_margin)
            roe = self._safe_float(fin[0].roe)
            if gm and roe:
                if gm > 50 and roe > 15:
                    score += 3.0; details = "高壁垒显著"
                elif gm > 35:
                    score += 1.5; details = "有一定壁垒"
                else:
                    score -= 1.0; details = "壁垒不清晰"
            return EvalDimension("技术壁垒", min(10, max(0, score)), 0.25, details)
        except Exception:
            return None

    def _eval_revenue_growth(self, code, errors, factors) -> Optional[EvalDimension]:
        """营收成长 15%"""
        try:
            fin = self._get_financials(code)
            if not fin: return None
            score = 5.0
            rev = self._safe_float(fin[0].revenue_yoy)
            if rev and rev > 30: score += 3.0
            elif rev and rev > 15: score += 1.5
            elif rev and rev < 0: score -= 1.5
            return EvalDimension("营收成长", min(10, max(0, score)), 0.15, f"YoY={rev}")
        except Exception:
            return None

    def _eval_bigfund_valuation(self, code, errors, factors) -> Optional[EvalDimension]:
        """估值容忍度(大基金对高估值更宽容)"""
        try:
            r = self._get_realtime(code)
            if not r: return None
            score = 5.0
            pe = self._safe_float(r.pe)
            if pe and pe < 30: score += 1.0
            if pe and pe > 80: score -= 1.5
            # 大基金更看战略价值而非当前估值
            return EvalDimension("估值(战略优先)", min(10, max(0, score)), 0.10, f"PE={pe}")
        except Exception:
            return None

    def _generate_summary(self, dims: list) -> str:
        if not dims: return "数据不足以评估"
        s = sum(d.score * d.weight for d in dims) / sum(d.weight for d in dims)
        if s >= 7.5: return "大基金标准高匹配: 高技术壁垒+高毛利+高成长"
        elif s >= 6.0: return "大基金标准匹配: 具备一定技术属性"
        elif s >= 4.0: return "大基金标准部分匹配"
        else: return "非大基金偏好方向"
