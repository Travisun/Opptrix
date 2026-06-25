"""
国际投行评估模块 — 9家顶级投行的个股评级方法论

每家投行都使用其公开知名的评估框架/模型:
  1. 高盛 (Goldman Sachs)      — GAMES + QGV 框架
  2. 摩根士丹利 (Morgan Stanley)  — EQS + 3S框架
  3. 摩根大通 (JPMorgan)       — CAR + GARP 框架
  4. 瑞银 (UBS)               — Evidence Lab + CFROI
  5. 花旗 (Citi)              — Q-Grade + 盈利修正模型
  6. 瑞信 (Credit Suisse)     — HOLT(CFROI) + ESG
  7. 巴克莱 (Barclays)        — QVM (Quality/Value/Momentum)
  8. 汇丰 (HSBC)              — Value + Catalyst
  9. 德银 (Deutsche Bank)     — Alpha Generation 模型

数据来源: 基于公开的机构研究报告方法论 + a_stock_layer 实时数据
"""

from __future__ import annotations
from typing import Optional, List, Dict
import numpy as np

from .base import (
    InstitutionEvaluator, InstitutionRating,
    RatingLevel, EvalDimension,
)


# ═══════════════════════════════════════════════════════════════════
# 1. 高盛 Goldman Sachs — GAMES + QGV 框架
# ═══════════════════════════════════════════════════════════════════
# GAMES: Growth / Asset quality / Management / Earnings / Stability
# QGV: Quality / Growth / Valuation 三维评分

class GoldmanSachsEvaluator(InstitutionEvaluator):
    """高盛 — GAMES框架 + QGV评分"""

    institution = "高盛 Goldman Sachs"
    institution_short = "Goldman Sachs"
    model_name = "GAMES + QGV"
    description = (
        "GAMES框架评估 Growth(成长)、Asset Quality(资产质量)、"
        "Management(管理层效率)、Earnings(盈利质量)、Stability(稳定性); "
        "QGV三维评分整合 Quality/Growth/Valuation"
    )

    def compute(self, code: str) -> InstitutionRating:
        errors = []
        dims: List[EvalDimension] = []
        factors: Dict[str, float] = {}

        try:
            # ── G: Growth 成长性 (权重 0.25) ──
            g_score = self._eval_growth(code, errors, factors)
            if g_score is not None:
                dims.append(g_score)

            # ── A: Asset Quality 资产质量 (权重 0.15) ──
            a_score = self._eval_asset_quality(code, errors, factors)
            if a_score is not None:
                dims.append(a_score)

            # ── M: Management Efficiency 管理层效率 (权重 0.15) ──
            m_score = self._eval_management(code, errors, factors)
            if m_score is not None:
                dims.append(m_score)

            # ── E: Earnings Quality 盈利质量 (权重 0.20) ──
            e_score = self._eval_earnings(code, errors, factors)
            if e_score is not None:
                dims.append(e_score)

            # ── S: Stability 稳定性 (权重 0.15) ──
            s_score = self._eval_stability(code, errors, factors)
            if s_score is not None:
                dims.append(s_score)

            # ── QGV 综合调整 (权重 0.10) ──
            qgv_score = self._eval_qgv(code, errors, factors)
            if qgv_score is not None:
                dims.append(qgv_score)

            summary = self._generate_summary(dims)
            return self._make_rating(code, dims, summary, factors, errors)

        except Exception as e:
            errors.append(f"高盛评估异常: {e}")
            return self._make_rating(code, dims, "评估出错", factors, errors)

    def _eval_growth(self, code: str, errors: list, factors: dict) -> Optional[EvalDimension]:
        """G: 成长性评估 — 营收/利润CAGR + 边际变化"""
        try:
            fin = self._get_financials(code)
            if not fin:
                return None

            revenues = [f.revenue for f in fin[:4] if f.revenue and f.revenue > 0]
            profits = [f.net_profit for f in fin[:4] if f.net_profit and f.net_profit > 0]

            score = 5.0
            details = []
            raw = {}

            # 营收CAGR
            if len(revenues) >= 3:
                rev_cagr = (revenues[0] / revenues[-1]) ** (1 / (len(revenues) - 1)) - 1
                raw["revenue_cagr"] = rev_cagr
                factors["gs_revenue_cagr"] = round(rev_cagr * 100, 2)
                if rev_cagr > 0.15:
                    score += 2.0
                    details.append(f"营收CAGR {rev_cagr*100:.1f}% >15%")
                elif rev_cagr > 0.08:
                    score += 1.0
                    details.append(f"营收CAGR {rev_cagr*100:.1f}% 稳健")
                elif rev_cagr > 0:
                    score += 0
                else:
                    score -= 1.5
                    details.append(f"营收增长停滞CAGR {rev_cagr*100:.1f}%")

            # 利润CAGR
            if len(profits) >= 3:
                pr_cagr = (profits[0] / profits[-1]) ** (1 / (len(profits) - 1)) - 1
                factors["gs_profit_cagr"] = round(pr_cagr * 100, 2)
                if pr_cagr > 0.20:
                    score += 2.0
                    details.append(f"利润CAGR {pr_cagr*100:.1f}% >20%")
                elif pr_cagr > 0.10:
                    score += 1.0
                elif pr_cagr < 0:
                    score -= 2.0
                    details.append("利润负增长")

            return EvalDimension("成长性 Growth", min(10, max(0, score)), 0.25,
                                 "; ".join(details) if details else "数据有限")
        except Exception as e:
            errors.append(f"Growth评估异常: {e}")
            return None

    def _eval_asset_quality(self, code: str, errors: list, factors: dict) -> Optional[EvalDimension]:
        """A: 资产质量 — 负债率 + 资产周转率 + FCF"""
        try:
            fin = self._get_financials(code)
            if not fin:
                return None
            latest = fin[0]
            score = 5.0
            details = []

            dr = self._safe_float(latest.debt_ratio)
            if dr is not None:
                factors["gs_debt_ratio"] = dr
                if dr < 30:
                    score += 2.0
                    details.append(f"低负债率 {dr:.1f}%")
                elif dr < 50:
                    score += 1.0
                    details.append(f"负债率适中 {dr:.1f}%")
                elif dr < 70:
                    score += 0
                else:
                    score -= 1.5
                    details.append(f"高负债率 {dr:.1f}%")

            ocf = self._safe_float(latest.operating_cash_flow)
            np_val = self._safe_float(latest.net_profit)
            if ocf and np_val and np_val > 0:
                ocf_ratio = ocf / np_val
                factors["gs_ocf_profit_ratio"] = round(ocf_ratio, 2)
                if ocf_ratio > 1.2:
                    score += 1.5
                    details.append("现金流充裕 >利润")
                elif ocf_ratio > 0.8:
                    score += 0.5
                elif ocf_ratio < 0.5:
                    score -= 1.0
                    details.append("现金流/利润比偏低")

            return EvalDimension("资产质量 Asset Quality", min(10, max(0, score)), 0.15,
                                 "; ".join(details) if details else "数据有限")
        except Exception as e:
            errors.append(f"Asset Quality评估异常: {e}")
            return None

    def _eval_management(self, code: str, errors: list, factors: dict) -> Optional[EvalDimension]:
        """M: 管理层效率 — ROE + 运营利润率 + 总资产收益率"""
        try:
            fin = self._get_financials(code)
            if not fin:
                return None
            latest = fin[0]
            score = 5.0
            details = []

            roe = self._safe_float(latest.roe)
            if roe is not None:
                factors["gs_roe"] = roe
                if roe > 20:
                    score += 2.5
                    details.append(f"ROE {roe:.1f}% 优秀")
                elif roe > 15:
                    score += 1.5
                    details.append(f"ROE {roe:.1f}% 良好")
                elif roe > 10:
                    score += 0.5
                elif roe < 5:
                    score -= 1.5
                    details.append(f"ROE {roe:.1f}% 偏低")

            gm = self._safe_float(latest.gross_margin)
            if gm is not None:
                factors["gs_gross_margin"] = gm
                if gm > 60:
                    score += 1.5
                    details.append(f"毛利率 {gm:.1f}% 优秀")
                elif gm > 40:
                    score += 0.5
                elif gm < 20:
                    score -= 1.0

            return EvalDimension("管理效率 Management", min(10, max(0, score)), 0.15,
                                 "; ".join(details) if details else "数据有限")
        except Exception as e:
            errors.append(f"Management评估异常: {e}")
            return None

    def _eval_earnings(self, code: str, errors: list, factors: dict) -> Optional[EvalDimension]:
        """E: 盈利质量 — 利润稳定性 + 利润率趋势 + 每股收益趋势"""
        try:
            fin = self._get_financials(code)
            if not fin or len(fin) < 3:
                return None
            score = 5.0
            details = []

            margins = []
            for f in fin[:4]:
                gm = self._safe_float(f.gross_margin)
                if gm:
                    margins.append(gm)
            if len(margins) >= 3:
                margin_trend = margins[0] - margins[-1]
                factors["gs_margin_trend_4q"] = round(margin_trend, 2)
                if margin_trend > 3:
                    score += 2.0
                    details.append(f"毛利率趋势改善 {margin_trend:.1f}%")
                elif margin_trend > 0:
                    score += 0.5
                elif margin_trend < -5:
                    score -= 2.0
                    details.append(f"毛利率趋势恶化 {margin_trend:.1f}%")
                elif margin_trend < -2:
                    score -= 1.0

            # EPS趋势
            eps_vals = [self._safe_float(f.eps) for f in fin[:4] if f.eps]
            eps_vals = [e for e in eps_vals if e is not None]
            if len(eps_vals) >= 3:
                eps_trend = eps_vals[0] - eps_vals[-1]
                factors["gs_eps_trend"] = round(eps_trend, 4)
                if eps_trend > 0:
                    score += 1.5
                    details.append("EPS持续增长")
                elif eps_trend < 0:
                    score -= 1.0
                    details.append("EPS下降趋势")

            return EvalDimension("盈利质量 Earnings", min(10, max(0, score)), 0.20,
                                 "; ".join(details) if details else "数据有限")
        except Exception as e:
            errors.append(f"Earnings评估异常: {e}")
            return None

    def _eval_stability(self, code: str, errors: list, factors: dict) -> Optional[EvalDimension]:
        """S: 稳定性 — Beta + 波动率 + 最大回撤"""
        try:
            kline = self._get_kline(code, count=250)
            if not kline or len(kline) < 60:
                return None

            closes = np.array([d.close for d in kline])
            returns = np.diff(closes) / closes[:-1]
            score = 5.0
            details = []

            vol = np.std(returns, ddof=1) * np.sqrt(252) * 100
            factors["gs_volatility"] = round(vol, 2)
            if vol < 25:
                score += 1.5
                details.append(f"低波动 {vol:.1f}%")
            elif vol < 35:
                score += 0.5
            elif vol > 50:
                score -= 1.5
                details.append(f"高波动 {vol:.1f}%")

            # 最大回撤
            peak = np.maximum.accumulate(closes)
            drawdown = (closes - peak) / peak
            mdd = float(np.min(drawdown) * 100)
            factors["gs_max_drawdown"] = round(mdd, 2)
            if mdd > -15:
                score += 1.5
                details.append(f"回撤可控 {mdd:.1f}%")
            elif mdd > -30:
                score += 0
            else:
                score -= 1.0
                details.append(f"大幅回撤 {mdd:.1f}%")

            return EvalDimension("稳定性 Stability", min(10, max(0, score)), 0.15,
                                 "; ".join(details) if details else "数据有限")
        except Exception as e:
            errors.append(f"Stability评估异常: {e}")
            return None

    def _eval_qgv(self, code: str, errors: list, factors: dict) -> Optional[EvalDimension]:
        """QGV综合调整 — Quality/Growth/Valuation 交叉验证"""
        try:
            r = self._get_realtime(code)
            if not r:
                return None
            score = 5.0
            details = []

            pe = self._safe_float(r.pe)
            pb = self._safe_float(r.pb)
            if pe and pe > 0:
                factors["gs_pe"] = pe
                if pe < 15:
                    score += 1.5
                    details.append(f"PE {pe:.1f}x 估值偏低")
                elif pe < 25:
                    score += 0.5
                    details.append(f"PE {pe:.1f}x 合理")
                elif pe > 40:
                    score -= 1.5
                    details.append(f"PE {pe:.1f}x 偏高")
            if pb:
                factors["gs_pb"] = pb

            return EvalDimension("QGV综合", min(10, max(0, score)), 0.10,
                                 "; ".join(details) if details else "")
        except Exception as e:
            errors.append(f"QGV评估异常: {e}")
            return None

    def _generate_summary(self, dims: list) -> str:
        if not dims:
            return "数据不足以评估"
        score = sum(d.score * d.weight for d in dims) / sum(d.weight for d in dims)
        if score >= 7.5:
            return "GAMES框架显示公司基本面优秀，成长与质量兼备"
        elif score >= 6.0:
            return "GAMES框架显示公司基本面良好，多数维度正面"
        elif score >= 4.0:
            return "GAMES框架显示公司存在部分风险点，需进一步观察"
        else:
            return "GAMES框架显示公司基本面偏弱，建议回避"


# ═══════════════════════════════════════════════════════════════════
# 2. 摩根士丹利 Morgan Stanley — EQS + 3S框架
# ═══════════════════════════════════════════════════════════════════
# EQS: Earnings Quality Score — 盈利质量综合评分
# 3S: Style / Sector / Stock — 自上而下三层次

class MorganStanleyEvaluator(InstitutionEvaluator):
    """摩根士丹利 — EQS盈利质量评分 + 3S框架"""

    institution = "摩根士丹利 Morgan Stanley"
    institution_short = "Morgan Stanley"
    model_name = "EQS + 3S"
    description = (
        "EQS(Earnings Quality Score)评估盈利的可持续性与真实性; "
        "3S框架从 Style(投资风格匹配)/Sector(行业周期位置)/Stock(个股α)三维评估"
    )

    def compute(self, code: str) -> InstitutionRating:
        errors = []
        dims: List[EvalDimension] = []
        factors: Dict[str, float] = {}
        try:
            # EQS核心
            eqs = self._eval_eqs(code, errors, factors)
            if eqs: dims.append(eqs)

            # Style匹配
            style = self._eval_style(code, errors, factors)
            if style: dims.append(style)

            # Sector位置
            sector = self._eval_sector(code, errors, factors)
            if sector: dims.append(sector)

            # Stock Alpha
            alpha = self._eval_individual_alpha(code, errors, factors)
            if alpha: dims.append(alpha)

            # 风险回报
            rr = self._eval_risk_reward(code, errors, factors)
            if rr: dims.append(rr)

            summary = self._generate_summary(dims)
            return self._make_rating(code, dims, summary, factors, errors)
        except Exception as e:
            errors.append(f"MS评估异常: {e}")
            return self._make_rating(code, dims, "评估出错", factors, errors)

    def _eval_eqs(self, code, errors, factors) -> Optional[EvalDimension]:
        """EQS 盈利质量评分"""
        try:
            fin = self._get_financials(code)
            if not fin or len(fin) < 3:
                return None
            score = 5.0
            details = []

            # 盈利稳定性 — 标准差/均值的变异系数
            profits = [f.net_profit for f in fin[:4] if f.net_profit and f.net_profit > 0]
            if len(profits) >= 3:
                cv = np.std(profits) / np.mean(profits)
                factors["ms_profit_cv"] = round(cv, 3)
                if cv < 0.3:
                    score += 2.0
                    details.append("盈利高度稳定")
                elif cv < 0.5:
                    score += 1.0
                else:
                    score -= 1.5
                    details.append("盈利波动大")

            # 利润率水平
            margins = [self._safe_float(f.gross_margin) for f in fin[:3] if f.gross_margin]
            margins = [m for m in margins if m is not None]
            if margins:
                avg_margin = np.mean(margins)
                factors["ms_avg_margin"] = round(avg_margin, 1)
                if avg_margin > 60:
                    score += 2.0
                    details.append(f"毛利率均值 {avg_margin:.1f}%")
                elif avg_margin < 20:
                    score -= 1.0

            return EvalDimension("盈利质量 EQS", min(10, max(0, score)), 0.30,
                                 "; ".join(details) if details else "数据有限")
        except Exception as e:
            errors.append(f"EQS异常: {e}")
            return None

    def _eval_style(self, code, errors, factors) -> Optional[EvalDimension]:
        """Style: 投资风格匹配 — 市值/波动/估值风格"""
        try:
            r = self._get_realtime(code)
            if not r:
                return None
            score = 5.0
            details = []
            mc = self._safe_float(r.market_cap)
            if mc:
                factors["ms_market_cap"] = mc
                # 大摩偏好大盘蓝筹
                if mc > 1e11:  # >1000亿
                    score += 1.5
                    details.append("大市值偏好")
                elif mc > 2e10:
                    score += 0.5
            return EvalDimension("风格匹配 Style", min(10, max(0, score)), 0.20,
                                 "; ".join(details) if details else "")
        except Exception as e:
            errors.append(f"Style异常: {e}")
            return None

    def _eval_sector(self, code, errors, factors) -> Optional[EvalDimension]:
        """Sector: 行业周期位置"""
        try:
            fin = self._get_financials(code)
            if not fin:
                return None
            score = 5.0
            details = []

            rev_yoy = self._safe_float(fin[0].revenue_yoy)
            pr_yoy = self._safe_float(fin[0].net_profit_yoy)
            if rev_yoy is not None:
                factors["ms_revenue_yoy"] = rev_yoy
                if rev_yoy > 20:
                    score += 1.5
                    details.append("行业景气上行")
                elif rev_yoy > 10:
                    score += 0.5
                elif rev_yoy < -10:
                    score -= 1.0
                    details.append("行业承压")
            if pr_yoy is not None:
                factors["ms_profit_yoy"] = pr_yoy
                if pr_yoy > 30:
                    score += 1.5
                elif pr_yoy < -20:
                    score -= 1.5
            return EvalDimension("行业周期 Sector", min(10, max(0, score)), 0.20,
                                 "; ".join(details) if details else "")
        except Exception as e:
            errors.append(f"Sector异常: {e}")
            return None

    def _eval_individual_alpha(self, code, errors, factors) -> Optional[EvalDimension]:
        """Stock: 个股α — 超额收益"""
        try:
            kline = self._get_kline(code, count=250)
            if not kline or len(kline) < 60:
                return None
            closes = np.array([d.close for d in kline])
            ret = (closes[-1] / closes[-60] - 1) * 100

            # 比较沪深300
            try:
                idx = self._de.index_kline("000300", "daily", count=60)
                if idx and idx.success and idx.data:
                    idx_closes = np.array([d.close for d in idx.data])
                    idx_ret = (idx_closes[-1] / idx_closes[0] - 1) * 100
                    alpha = ret - idx_ret
                    factors["ms_alpha_60d"] = round(alpha, 2)
                    score = 5.0 + alpha / 5
                    details = [f"60天α {alpha:+.1f}%"]
                    return EvalDimension("个股超额 Alpha", min(10, max(0, score)), 0.15,
                                         "; ".join(details))
            except Exception:
                pass
            return None
        except Exception as e:
            errors.append(f"Alpha异常: {e}")
            return None

    def _eval_risk_reward(self, code, errors, factors) -> Optional[EvalDimension]:
        """风险回报比"""
        try:
            kline = self._get_kline(code, count=120)
            r = self._get_realtime(code)
            if not kline or len(kline) < 60 or not r:
                return None
            score = 5.0
            closes = np.array([d.close for d in kline])
            ret_6m = (closes[-1] / closes[0] - 1) * 100

            returns = np.diff(np.log(closes))
            vol = np.std(returns) * np.sqrt(252) * 100
            sharpe = (ret_6m / vol) * 2 if vol > 0 else 0
            factors["ms_6m_sharpe"] = round(sharpe, 2)

            if sharpe > 1:
                score += 2.0
            elif sharpe > 0.5:
                score += 1.0
            elif sharpe < -0.5:
                score -= 1.5

            return EvalDimension("风险回报 RR", min(10, max(0, score)), 0.15,
                                 f"夏普 {sharpe:.2f}")
        except Exception as e:
            errors.append(f"RR异常: {e}")
            return None

    def _generate_summary(self, dims: list) -> str:
        if not dims:
            return "数据不足以评估"
        score = sum(d.score * d.weight for d in dims) / sum(d.weight for d in dims)
        if score >= 7.5:
            return "EQS盈利质量优秀，3S框架全面看好"
        elif score >= 6.0:
            return "EQS评分良好，多数维度积极"
        elif score >= 4.0:
            return "存在不确定性，建议等待更明确信号"
        else:
            return "EQS偏低，多维度指向风险"


# ═══════════════════════════════════════════════════════════════════
# 3. 摩根大通 JPMorgan — CAR + GARP 框架
# ═══════════════════════════════════════════════════════════════════
# CAR: Catalysts(催化剂) / Analysis(基本面分析) / Risk/Reward(风险回报)
# GARP: Growth at Reasonable Price

class JPMorganEvaluator(InstitutionEvaluator):
    """摩根大通 — CAR + GARP 框架"""

    institution = "摩根大通 JPMorgan"
    institution_short = "JPMorgan"
    model_name = "CAR + GARP"
    description = (
        "CAR框架: Catalysts(催化剂事件)/Analysis(基本面)/Risk-Reward(风险回报比); "
        "GARP策略: 以合理价格买入成长(Growth@ReasonablePrice)"
    )

    def compute(self, code: str) -> InstitutionRating:
        errors = []
        dims: List[EvalDimension] = []
        factors: Dict[str, float] = {}
        try:
            c = self._eval_catalysts(code, errors, factors)
            if c: dims.append(c)
            a = self._eval_analysis(code, errors, factors)
            if a: dims.append(a)
            rr = self._eval_risk_reward_car(code, errors, factors)
            if rr: dims.append(rr)
            garp = self._eval_garp(code, errors, factors)
            if garp: dims.append(garp)

            summary = self._generate_summary(dims)
            return self._make_rating(code, dims, summary, factors, errors)
        except Exception as e:
            errors.append(f"JPM评估异常: {e}")
            return self._make_rating(code, dims, "评估出错", factors, errors)

    def _eval_catalysts(self, code, errors, factors) -> Optional[EvalDimension]:
        """C: 催化剂事件 — 业绩预告/股东增持/回购/机构调研"""
        try:
            score = 5.0
            details = []
            fin = self._get_financials(code)
            if fin:
                pr_yoy = self._safe_float(fin[0].net_profit_yoy)
                if pr_yoy and pr_yoy > 50:
                    score += 2.0
                    details.append("业绩爆发增长")
                elif pr_yoy and pr_yoy > 20:
                    score += 1.0
                    details.append("业绩加速")
            # 简化: 基于估值和动量判断催化剂
            r = self._get_realtime(code)
            if r:
                pe = self._safe_float(r.pe)
                if pe and pe < 15:
                    score += 1.0
                    details.append("低估值安全垫")
            return EvalDimension("催化剂 Catalysts", min(10, max(0, score)), 0.25,
                                 "; ".join(details) if details else "无明显催化剂")
        except Exception as e:
            errors.append(f"Catalyst异常: {e}")
            return None

    def _eval_analysis(self, code, errors, factors) -> Optional[EvalDimension]:
        """A: 基本面分析"""
        try:
            fin = self._get_financials(code)
            if not fin: return None
            score = 5.0
            details = []
            roe = self._safe_float(fin[0].roe)
            if roe:
                factors["jpm_roe"] = roe
                if roe > 20: score += 1.5; details.append(f"ROE {roe:.1f}%")
                elif roe > 15: score += 1.0
                elif roe < 5: score -= 1.5

            rev = self._safe_float(fin[0].revenue_yoy)
            if rev and rev > 10: score += 0.5
            elif rev and rev < -10: score -= 1.0

            return EvalDimension("基本面 Analysis", min(10, max(0, score)), 0.30,
                                 "; ".join(details) if details else "数据有限")
        except Exception as e:
            errors.append(f"Analysis异常: {e}")
            return None

    def _eval_risk_reward_car(self, code, errors, factors) -> Optional[EvalDimension]:
        """RR: 风险回报比"""
        try:
            kline = self._get_kline(code, count=120)
            if not kline or len(kline) < 60: return None
            score = 5.0
            closes = np.array([d.close for d in kline])

            # 技术位置
            ma60 = np.mean(closes[-60:])
            current_pct = (closes[-1] - ma60) / ma60 * 100
            factors["jpm_ma60_deviation"] = round(current_pct, 2)

            if -10 < current_pct < 10:
                score += 1.5
            elif -20 < current_pct < 20:
                score += 0.5
            else:
                score -= 1.0

            return EvalDimension("风险回报 Risk/Reward", min(10, max(0, score)), 0.20,
                                 f"MA60偏离 {current_pct:+.1f}%")
        except Exception as e:
            errors.append(f"RiskReward异常: {e}")
            return None

    def _eval_garp(self, code, errors, factors) -> Optional[EvalDimension]:
        """GARP: 合理价格成长 — PEG + 估值匹配度"""
        try:
            fin = self._get_financials(code)
            r = self._get_realtime(code)
            if not fin or not r: return None
            score = 5.0
            details = []

            pe = self._safe_float(r.pe)
            eps = self._safe_float(fin[0].eps)
            profits = [f.net_profit for f in fin[:3] if f.net_profit and f.net_profit > 0]

            if pe and len(profits) >= 2 and profits[0] > 0 and profits[-1] > 0:
                cagr = (profits[0] / profits[-1]) ** (1 / (len(profits) - 1)) - 1
                if cagr > 0:
                    peg = pe / (cagr * 100)
                    factors["jpm_peg"] = round(peg, 2)
                    if peg < 1:
                        score += 2.5; details.append(f"PEG {peg:.2f} <1 低估")
                    elif peg < 1.5:
                        score += 1.5; details.append(f"PEG {peg:.2f} 合理")
                    elif peg < 2:
                        score += 0
                    else:
                        score -= 1.5; details.append(f"PEG {peg:.2f} 偏高")

            return EvalDimension("GARP(合理价格成长)", min(10, max(0, score)), 0.25,
                                 "; ".join(details) if details else "数据不足")
        except Exception as e:
            errors.append(f"GARP异常: {e}")
            return None

    def _generate_summary(self, dims: list) -> str:
        if not dims: return "数据不足以评估"
        score = sum(d.score * d.weight for d in dims) / sum(d.weight for d in dims)
        if score >= 7.5: return "CAR框架显示催化剂充分+GARP估值合理，强烈看好"
        elif score >= 6.0: return "CAR框架整体正面，催化剂与基本面匹配"
        elif score >= 4.0: return "有待催化剂兑现或估值改善"
        else: return "CAR框架偏负面，风险回报比不佳"


# ═══════════════════════════════════════════════════════════════════
# 4. 瑞银 UBS — Evidence Lab + CFROI
# ═══════════════════════════════════════════════════════════════════
# Evidence Lab: 另类数据验证基本面
# CFROI: 现金回报率 — 衡量真实股东回报

class UBSEvaluator(InstitutionEvaluator):
    """瑞银 — Evidence Lab + CFROI"""

    institution = "瑞银 UBS"
    institution_short = "UBS"
    model_name = "Evidence Lab + CFROI"
    description = (
        "Evidence Lab: 运用另类数据验证基本面真实性; "
        "CFROI(Cash Flow Return on Investment): 以现金回报率衡量企业真实价值创造"
    )

    def compute(self, code: str) -> InstitutionRating:
        errors = []
        dims: List[EvalDimension] = []
        factors: Dict[str, float] = {}
        try:
            cfroi = self._eval_cfroi(code, errors, factors)
            if cfroi: dims.append(cfroi)

            evidence = self._eval_evidence(code, errors, factors)
            if evidence: dims.append(evidence)

            sustainable = self._eval_sustainability(code, errors, factors)
            if sustainable: dims.append(sustainable)

            valuation = self._eval_ubs_valuation(code, errors, factors)
            if valuation: dims.append(valuation)

            summary = self._generate_summary(dims)
            return self._make_rating(code, dims, summary, factors, errors)
        except Exception as e:
            errors.append(f"UBS评估异常: {e}")
            return self._make_rating(code, dims, "评估出错", factors, errors)

    def _eval_cfroi(self, code, errors, factors) -> Optional[EvalDimension]:
        """CFROI: 现金回报率 — OCF / (总资产-流动负债)"""
        try:
            fin = self._get_financials(code)
            if not fin: return None
            score = 5.0
            details = []
            ocf = self._safe_float(fin[0].operating_cash_flow)
            assets = self._safe_float(fin[0].total_assets)
            if ocf and assets and assets > 0:
                cfroi = ocf / assets * 100
                factors["ubs_cfroi"] = round(cfroi, 2)
                if cfroi > 15:
                    score += 2.5; details.append(f"CFROI {cfroi:.1f}% 优秀")
                elif cfroi > 10:
                    score += 1.5; details.append(f"CFROI {cfroi:.1f}% 良好")
                elif cfroi > 5:
                    score += 0.5
                else:
                    score -= 1.5; details.append(f"CFROI {cfroi:.1f}% 偏低")

            return EvalDimension("CFROI现金回报", min(10, max(0, score)), 0.35,
                                 "; ".join(details) if details else "")
        except Exception as e:
            errors.append(f"CFROI异常: {e}")
            return None

    def _eval_evidence(self, code, errors, factors) -> Optional[EvalDimension]:
        """Evidence Lab: 数据验证 — 现金流vs利润匹配"""
        try:
            fin = self._get_financials(code)
            if not fin or len(fin) < 2: return None
            score = 5.0
            details = []

            # OCF/NetProfit 比率（连续多期）
            ratios = []
            for f in fin[:4]:
                o = self._safe_float(f.operating_cash_flow)
                n = self._safe_float(f.net_profit)
                if o and n and n > 0:
                    ratios.append(o / n)
            if ratios:
                avg_ratio = np.mean(ratios)
                factors["ubs_ocf_profit_ratio"] = round(avg_ratio, 2)
                if avg_ratio > 1.0:
                    score += 2.0; details.append(f"OCF/Profit {avg_ratio:.2f} 利润真实")
                elif avg_ratio > 0.7:
                    score += 0.5; details.append(f"OCF/Profit {avg_ratio:.2f} 尚可")
                else:
                    score -= 1.5; details.append(f"OCF/Profit {avg_ratio:.2f} 利润质量存疑")

            return EvalDimension("Evidence Lab验证", min(10, max(0, score)), 0.25,
                                 "; ".join(details) if details else "")
        except Exception as e:
            errors.append(f"Evidence异常: {e}")
            return None

    def _eval_sustainability(self, code, errors, factors) -> Optional[EvalDimension]:
        """可持续性 — 股息率 + ROE持续性"""
        try:
            r = self._get_realtime(code)
            fin = self._get_financials(code)
            if not r: return None
            score = 5.0
            details = []

            pe = self._safe_float(r.pe)
            if fin:
                roe = self._safe_float(fin[0].roe)
                if roe and roe > 10:
                    score += 1.5; details.append(f"ROE {roe:.1f}% 支撑再投资")
                if roe and pe and pe > 0:
                    # 盈利收益率 vs 无风险利率
                    ey = roe / pe
                    factors["ubs_earnings_yield"] = round(ey, 3)
                    if ey > 0.05:
                        score += 1.0
            return EvalDimension("可持续性", min(10, max(0, score)), 0.20,
                                 "; ".join(details) if details else "")
        except Exception as e:
            errors.append(f"Sustainability异常: {e}")
            return None

    def _eval_ubs_valuation(self, code, errors, factors) -> Optional[EvalDimension]:
        """瑞银风格估值 — 注重绝对估值"""
        try:
            r = self._get_realtime(code)
            if not r: return None
            score = 5.0
            details = []
            pe = self._safe_float(r.pe)
            pb = self._safe_float(r.pb)
            if pe:
                factors["ubs_pe"] = pe
                if pe < 12:
                    score += 2.0; details.append(f"PE {pe:.1f}x 显著低估")
                elif pe < 20:
                    score += 1.0; details.append(f"PE {pe:.1f}x 合理偏低")
                elif pe > 35:
                    score -= 1.5; details.append(f"PE {pe:.1f}x 估值偏高")
                if pb:
                    factors["ubs_pb"] = pb
                    if pb < 1.5 and pe < 15:
                        score += 1.0
            return EvalDimension("估值 Valuation", min(10, max(0, score)), 0.20,
                                 "; ".join(details) if details else "")
        except Exception as e:
            errors.append(f"估值异常: {e}")
            return None

    def _generate_summary(self, dims: list) -> str:
        if not dims: return "数据不足以评估"
        score = sum(d.score * d.weight for d in dims) / sum(d.weight for d in dims)
        if score >= 7.5: return "CFROI优秀+Evidence Lab验证通过，高质量标的"
        elif score >= 6.0: return "CFROI良好，现金流和基本面匹配"
        elif score >= 4.0: return "CFROI一般，需验证利润真实性"
        else: return "CFROI偏低，现金流质量存疑"


# ═══════════════════════════════════════════════════════════════════
# 5. 花旗 Citi — Q-Grade + 盈利修正模型
# ═══════════════════════════════════════════════════════════════════
# Q-Grade: 量化评分框架 (Quality + Quant)
# 盈利修正模型: 分析师调高/调低预期的方向

class CitiEvaluator(InstitutionEvaluator):
    """花旗 — Q-Grade + 盈利修正模型"""

    institution = "花旗 Citi"
    institution_short = "Citi"
    model_name = "Q-Grade + Earnings Revision"
    description = (
        "Q-Grade: 综合 Quality(质量)/Valuation(估值)/Growth(成长)/Momentum(动量)量化评分; "
        "盈利修正模型追踪EPS预期的上调/下调趋势"
    )

    def compute(self, code: str) -> InstitutionRating:
        errors = []
        dims: List[EvalDimension] = []
        factors: Dict[str, float] = {}
        try:
            q = self._eval_quality(code, errors, factors)
            if q: dims.append(q)
            v = self._eval_citi_valuation(code, errors, factors)
            if v: dims.append(v)
            g = self._eval_citi_growth(code, errors, factors)
            if g: dims.append(g)
            m = self._eval_momentum(code, errors, factors)
            if m: dims.append(m)

            summary = self._generate_summary(dims)
            return self._make_rating(code, dims, summary, factors, errors)
        except Exception as e:
            errors.append(f"Citi评估异常: {e}")
            return self._make_rating(code, dims, "评估出错", factors, errors)

    def _eval_quality(self, code, errors, factors) -> Optional[EvalDimension]:
        try:
            fin = self._get_financials(code)
            if not fin: return None
            score = 5.0; details = []
            roe = self._safe_float(fin[0].roe)
            if roe:
                factors["citi_roe"] = roe
                if roe > 20: score += 2.0; details.append(f"ROE {roe:.1f}% Top")
                elif roe > 15: score += 1.5; details.append(f"ROE {roe:.1f}% 良好")
                elif roe < 5: score -= 1.5
            dr = self._safe_float(fin[0].debt_ratio)
            if dr is not None and dr < 40: score += 1.0
            return EvalDimension("质量 Quality", min(10, max(0, score)), 0.30,
                                 "; ".join(details) if details else "")
        except Exception:
            return None

    def _eval_citi_valuation(self, code, errors, factors) -> Optional[EvalDimension]:
        try:
            r = self._get_realtime(code)
            if not r: return None
            score = 5.0; details = []
            pe = self._safe_float(r.pe)
            pb = self._safe_float(r.pb)
            if pe:
                factors["citi_pe"] = pe
                if pe < 12: score += 2.0; details.append(f"PE {pe:.1f}x 低估")
                elif pe < 20: score += 1.0; details.append("估值合理")
                elif pe > 40: score -= 2.0; details.append("估值偏高")
            if pb and pb < 1 and pe and pe < 15:
                score += 1.0; details.append("破净+低PE")
            return EvalDimension("估值 Valuation", min(10, max(0, score)), 0.25,
                                 "; ".join(details) if details else "")
        except Exception:
            return None

    def _eval_citi_growth(self, code, errors, factors) -> Optional[EvalDimension]:
        try:
            fin = self._get_financials(code)
            if not fin: return None
            score = 5.0; details = []
            rev = self._safe_float(fin[0].revenue_yoy)
            pr = self._safe_float(fin[0].net_profit_yoy)
            if rev:
                factors["citi_rev_yoy"] = rev
                if rev > 30: score += 2.0; details.append(f"营收增长{rev:.1f}%")
                elif rev > 15: score += 1.0
                elif rev < -10: score -= 1.5
            if pr:
                factors["citi_profit_yoy"] = pr
                if pr > 30: score += 1.5; details.append(f"利润增长{pr:.1f}%")
                elif pr < -15: score -= 1.5
            return EvalDimension("成长 Growth", min(10, max(0, score)), 0.25,
                                 "; ".join(details) if details else "")
        except Exception:
            return None

    def _eval_momentum(self, code, errors, factors) -> Optional[EvalDimension]:
        try:
            kline = self._get_kline(code, count=120)
            if not kline or len(kline) < 60: return None
            score = 5.0; details = []
            closes = np.array([d.close for d in kline])
            ret_3m = (closes[-1] / closes[-60] - 1) * 100
            ret_1m = (closes[-1] / closes[-20] - 1) * 100 if len(closes) >= 20 else 0
            factors["citi_mom_3m"] = round(ret_3m, 2)
            factors["citi_mom_1m"] = round(ret_1m, 2)

            if ret_3m > 15 and ret_1m > 5:
                score += 2.0; details.append("动量强劲")
            elif ret_3m > 5:
                score += 1.0; details.append("温和上行")
            elif ret_3m < -15:
                score -= 1.5; details.append("弱势下跌")
            elif ret_3m < -5:
                score -= 0.5

            return EvalDimension("动量 Momentum", min(10, max(0, score)), 0.20,
                                 "; ".join(details) if details else "")
        except Exception:
            return None

    def _generate_summary(self, dims: list) -> str:
        if not dims: return "数据不足以评估"
        score = sum(d.score * d.weight for d in dims) / sum(d.weight for d in dims)
        if score >= 7.5: return "Q-Grade高分: 质量+成长+动量共振"
        elif score >= 6.0: return "Q-Grade良好: 多数维度正面"
        elif score >= 4.0: return "Q-Grade中性: 部分维度需改善"
        else: return "Q-Grade偏低: 多个维度表现不佳"


# ═══════════════════════════════════════════════════════════════════
# 6. 瑞信 Credit Suisse — HOLT (CFROI) + ESG
# ═══════════════════════════════════════════════════════════════════
# HOLT: 基于CFROI的跨周期估值框架
# ESG: 环境/社会/治理评分

class CreditSuisseEvaluator(InstitutionEvaluator):
    """瑞信 — HOLT框架(CFROI) + ESG评估"""

    institution = "瑞信 Credit Suisse"
    institution_short = "Credit Suisse"
    model_name = "HOLT + ESG"
    description = (
        "HOLT框架: 以CFROI为核心判断企业跨周期价值创造能力; "
        "ESG维度评估可持续发展竞争力"
    )

    def compute(self, code: str) -> InstitutionRating:
        errors = []
        dims: List[EvalDimension] = []
        factors: Dict[str, float] = {}
        try:
            holt = self._eval_holt_cfroi(code, errors, factors)
            if holt: dims.append(holt)

            cross_cycle = self._eval_cross_cycle(code, errors, factors)
            if cross_cycle: dims.append(cross_cycle)

            esg = self._eval_esg(code, errors, factors)
            if esg: dims.append(esg)

            summary = self._generate_summary(dims)
            return self._make_rating(code, dims, summary, factors, errors)
        except Exception as e:
            errors.append(f"CS评估异常: {e}")
            return self._make_rating(code, dims, "评估出错", factors, errors)

    def _eval_holt_cfroi(self, code, errors, factors) -> Optional[EvalDimension]:
        try:
            fin = self._get_financials(code)
            if not fin or len(fin) < 2: return None
            score = 5.0; details = []

            ocf_vals = [self._safe_float(f.operating_cash_flow) for f in fin[:4]]
            ocf_vals = [o for o in ocf_vals if o is not None]
            assets_vals = [self._safe_float(f.total_assets) for f in fin[:4]]
            assets_vals = [a for a in assets_vals if a is not None and a > 0]

            if ocf_vals and assets_vals:
                cfroi_vals = [o / a * 100 for o, a in zip(ocf_vals, assets_vals)]
                avg_cfroi = np.mean(cfroi_vals)
                trend = cfroi_vals[0] - cfroi_vals[-1] if len(cfroi_vals) >= 2 else 0
                factors["cs_cfroi_avg"] = round(avg_cfroi, 2)
                factors["cs_cfroi_trend"] = round(trend, 2)

                if avg_cfroi > 12:
                    score += 2.0; details.append(f"CFROI均{avg_cfroi:.1f}% 优异")
                elif avg_cfroi > 8:
                    score += 1.0; details.append(f"CFROI均{avg_cfroi:.1f}% 良好")
                elif avg_cfroi < 3:
                    score -= 1.5; details.append(f"CFROI均{avg_cfroi:.1f}% 偏低")

                if trend > 2:
                    score += 1.0; details.append("CFROI趋势改善")
                elif trend < -2:
                    score -= 1.0; details.append("CFROI趋势恶化")

            return EvalDimension("HOLT-CFROI", min(10, max(0, score)), 0.35,
                                 "; ".join(details) if details else "")
        except Exception:
            return None

    def _eval_cross_cycle(self, code, errors, factors) -> Optional[EvalDimension]:
        """跨周期韧性 — 多期ROE稳定性"""
        try:
            fin = self._get_financials(code)
            if not fin or len(fin) < 3: return None
            score = 5.0; details = []
            roes = [self._safe_float(f.roe) for f in fin[:4] if f.roe]
            roes = [r for r in roes if r is not None]
            if len(roes) >= 3:
                roe_vol = np.std(roes)
                factors["cs_roe_volatility"] = round(roe_vol, 2)
                if roe_vol < 3:
                    score += 2.0; details.append(f"ROE高度稳定(σ={roe_vol:.1f})")
                elif roe_vol < 5:
                    score += 0.5
                else:
                    score -= 1.0; details.append(f"ROE波动大(σ={roe_vol:.1f})")

            return EvalDimension("跨周期韧性", min(10, max(0, score)), 0.30,
                                 "; ".join(details) if details else "")
        except Exception:
            return None

    def _eval_esg(self, code, errors, factors) -> Optional[EvalDimension]:
        """ESG代理评分 — 负债率(治理) + 稳定性(环境)"""
        try:
            fin = self._get_financials(code)
            r = self._get_realtime(code)
            if not fin: return None
            score = 5.0; details = []
            dr = self._safe_float(fin[0].debt_ratio)
            if dr is not None:
                factors["cs_debt"] = dr
                if dr < 30: score += 1.5; details.append(f"低负债{dr:.1f}%")
                elif dr < 50: score += 0.5
                elif dr > 70: score -= 1.5; details.append(f"高负债{dr:.1f}%")
            if r:
                mc = self._safe_float(r.market_cap)
                if mc and mc > 1e11: score += 1.5; details.append("大市值治理更优")

            return EvalDimension("ESG代理评分", min(10, max(0, score)), 0.35,
                                 "; ".join(details) if details else "")
        except Exception:
            return None

    def _generate_summary(self, dims: list) -> str:
        if not dims: return "数据不足以评估"
        score = sum(d.score * d.weight for d in dims) / sum(d.weight for d in dims)
        if score >= 7.5: return "HOLT框架显示强劲价值创造+ESG良好"
        elif score >= 6.0: return "HOLT框架正面，跨周期韧性较强"
        elif score >= 4.0: return "HOLT框架中性，需关注CFROI趋势"
        else: return "HOLT框架偏弱，价值创造能力不足"


# ═══════════════════════════════════════════════════════════════════
# 7. 巴克莱 Barclays — QVM (Quality/Value/Momentum)
# ═══════════════════════════════════════════════════════════════════

class BarclaysEvaluator(InstitutionEvaluator):
    """巴克莱 — QVM三维评分"""

    institution = "巴克莱 Barclays"
    institution_short = "Barclays"
    model_name = "QVM (Quality/Value/Momentum)"
    description = "QVM框架: Quality(质量)/Value(价值)/Momentum(动量)三维量化评分"

    def compute(self, code: str) -> InstitutionRating:
        errors = []
        dims: List[EvalDimension] = []
        factors: Dict[str, float] = {}
        try:
            q = self._eval_quality_qvm(code, errors, factors)
            if q: dims.append(q)
            v = self._eval_value_qvm(code, errors, factors)
            if v: dims.append(v)
            m = self._eval_momentum_qvm(code, errors, factors)
            if m: dims.append(m)
            summary = self._generate_summary(dims)
            return self._make_rating(code, dims, summary, factors, errors)
        except Exception:
            return self._make_rating(code, dims, "评估出错", factors, errors)

    def _eval_quality_qvm(self, code, errors, factors) -> Optional[EvalDimension]:
        try:
            fin = self._get_financials(code)
            if not fin: return None
            score = 5.0; details = []
            roe = self._safe_float(fin[0].roe)
            gm = self._safe_float(fin[0].gross_margin)
            if roe: factors["barc_roe"] = roe
            if gm: factors["barc_gm"] = gm
            if roe and roe > 20: score += 2.0
            if gm and gm > 60: score += 1.5
            if roe and roe < 5: score -= 1.5
            return EvalDimension("质量 Quality", min(10, max(0, score)), 0.30,
                                 "; ".join(details) if details else "")
        except Exception:
            return None

    def _eval_value_qvm(self, code, errors, factors) -> Optional[EvalDimension]:
        try:
            r = self._get_realtime(code)
            if not r: return None
            score = 5.0; details = []
            pe = self._safe_float(r.pe)
            pb = self._safe_float(r.pb)
            dy = self._safe_float(r.pe)  # 股息率没有直接字段
            if pe:
                factors["barc_pe"] = pe
                if pe < 10: score += 2.5; details.append(f"深度价值PE {pe:.1f}x")
                elif pe < 15: score += 1.5; details.append(f"价值股PE {pe:.1f}x")
                elif pe < 25: score += 0.5
                else: score -= 1.5; details.append(f"PE {pe:.1f}x 偏高")
            if pb and pb < 1: score += 1.5; details.append("破净")
            return EvalDimension("价值 Value", min(10, max(0, score)), 0.35,
                                 "; ".join(details) if details else "")
        except Exception:
            return None

    def _eval_momentum_qvm(self, code, errors, factors) -> Optional[EvalDimension]:
        try:
            kline = self._get_kline(code, count=120)
            if not kline or len(kline) < 60: return None
            score = 5.0; details = []
            closes = np.array([d.close for d in kline])
            ret_6m = (closes[-1] / closes[-120] - 1) * 100
            ret_1m = (closes[-1] / closes[-20] - 1) * 100
            factors["barc_mom_6m"] = round(ret_6m, 2)
            factors["barc_mom_1m"] = round(ret_1m, 2)
            if ret_6m > 20: score += 2.0; details.append(f"6m涨{ret_6m:.1f}% 强势")
            elif ret_6m > 10: score += 1.0
            elif ret_6m < -20: score -= 1.5; details.append("6m弱势")
            if ret_1m > ret_6m: score += 0.5; details.append("短期加速")
            return EvalDimension("动量 Momentum", min(10, max(0, score)), 0.35,
                                 "; ".join(details) if details else "")
        except Exception:
            return None

    def _generate_summary(self, dims: list) -> str:
        if not dims: return "数据不足以评估"
        score = sum(d.score * d.weight for d in dims) / sum(d.weight for d in dims)
        if score >= 7.5: return "QVM三星闪耀: 高质量+好价格+强动量"
        elif score >= 6.0: return "QVM整体正面"
        elif score >= 4.0: return "QVM两正一负或中性"
        else: return "QVM偏弱，多数维度不利"


# ═══════════════════════════════════════════════════════════════════
# 8. 汇丰 HSBC — Value + Catalyst Approach
# ═══════════════════════════════════════════════════════════════════

class HSBCEvaluator(InstitutionEvaluator):
    """汇丰 — Value + Catalyst 评估"""

    institution = "汇丰 HSBC"
    institution_short = "HSBC"
    model_name = "Value + Catalyst"
    description = (
        "汇丰研究所框架: 以绝对价值(PE/PB/DCF)为锚，"
        "以催化剂事件(盈利预期改善/行业政策/产品周期)为触发信号"
    )

    def compute(self, code: str) -> InstitutionRating:
        errors = []
        dims: List[EvalDimension] = []
        factors: Dict[str, float] = {}
        try:
            absolute_val = self._eval_absolute_value(code, errors, factors)
            if absolute_val: dims.append(absolute_val)

            catalyst = self._eval_catalyst_hsbc(code, errors, factors)
            if catalyst: dims.append(catalyst)

            income_potential = self._eval_income(code, errors, factors)
            if income_potential: dims.append(income_potential)

            summary = self._generate_summary(dims)
            return self._make_rating(code, dims, summary, factors, errors)
        except Exception:
            return self._make_rating(code, dims, "评估出错", factors, errors)

    def _eval_absolute_value(self, code, errors, factors) -> Optional[EvalDimension]:
        """绝对价值评估"""
        try:
            r = self._get_realtime(code)
            fin = self._get_financials(code)
            if not r: return None
            score = 5.0; details = []
            pe = self._safe_float(r.pe)
            if pe and pe < 12: score += 2.0; details.append(f"PE {pe:.1f}x")
            elif pe and pe < 18: score += 1.0
            elif pe and pe > 35: score -= 1.5

            if fin:
                eps = self._safe_float(fin[0].eps)
                if eps and pe and eps > 0:
                    earnings_yield = 1 / pe * 100
                    factors["hsbc_earnings_yield"] = round(earnings_yield, 2)
                    if earnings_yield > 5:
                        score += 1.5; details.append(f"盈利收益率{earnings_yield:.1f}%")
            return EvalDimension("绝对价值", min(10, max(0, score)), 0.40,
                                 "; ".join(details) if details else "")
        except Exception:
            return None

    def _eval_catalyst_hsbc(self, code, errors, factors) -> Optional[EvalDimension]:
        """催化剂信号"""
        try:
            fin = self._get_financials(code)
            kline = self._get_kline(code, count=60)
            score = 5.0; details = []

            if fin:
                rev_yoy = self._safe_float(fin[0].revenue_yoy)
                pr_yoy = self._safe_float(fin[0].net_profit_yoy)
                if pr_yoy and pr_yoy > 50:
                    score += 2.0; details.append("业绩爆发催化剂")
                elif pr_yoy and pr_yoy > 20:
                    score += 1.0; details.append("业绩加速催化剂")

            if kline and len(kline) >= 20:
                closes = np.array([d.close for d in kline])
                vol = np.array([d.volume for d in kline], dtype=float)
                recent_vol = np.mean(vol[-5:])
                prev_vol = np.mean(vol[-20:-5])
                if prev_vol > 0 and recent_vol / prev_vol > 1.5:
                    score += 1.0; details.append("量能放大")

            return EvalDimension("催化剂 Catalyst", min(10, max(0, score)), 0.35,
                                 "; ".join(details) if details else "无明显催化剂")
        except Exception:
            return None

    def _eval_income(self, code, errors, factors) -> Optional[EvalDimension]:
        """收益潜力 — 股息预期"""
        try:
            r = self._get_realtime(code)
            if not r: return None
            score = 5.0; details = []
            pe = self._safe_float(r.pe)
            if pe and pe < 15:
                score += 1.5; details.append("低PE支撑上行")
            return EvalDimension("收益潜力", min(10, max(0, score)), 0.25,
                                 "; ".join(details) if details else "")
        except Exception:
            return None

    def _generate_summary(self, dims: list) -> str:
        if not dims: return "数据不足以评估"
        score = sum(d.score * d.weight for d in dims) / sum(d.weight for d in dims)
        if score >= 7.5: return "价值锚点清晰+催化剂明确，双重利好"
        elif score >= 6.0: return "价值合理，催化剂积极"
        elif score >= 4.0: return "价值中性，等待催化剂兑现"
        else: return "价值偏高或催化剂不足"


# ═══════════════════════════════════════════════════════════════════
# 9. 德银 Deutsche Bank — Alpha Generation 模型
# ═══════════════════════════════════════════════════════════════════

class DeutscheBankEvaluator(InstitutionEvaluator):
    """德银 — Alpha Generation 多因子模型"""

    institution = "德银 Deutsche Bank"
    institution_short = "Deutsche Bank"
    model_name = "Alpha Generation"
    description = "德银量化Alpha模型: 融合估值/质量/动量/低波/规模五因子生成超额收益信号"

    def compute(self, code: str) -> InstitutionRating:
        errors = []
        dims: List[EvalDimension] = []
        factors: Dict[str, float] = {}
        try:
            val = self._eval_value_alpha(code, errors, factors)
            if val: dims.append(val)
            q = self._eval_quality_alpha(code, errors, factors)
            if q: dims.append(q)
            mom = self._eval_momentum_alpha(code, errors, factors)
            if mom: dims.append(mom)
            lowvol = self._eval_lowvol_alpha(code, errors, factors)
            if lowvol: dims.append(lowvol)
            size = self._eval_size_alpha(code, errors, factors)
            if size: dims.append(size)

            summary = self._generate_summary(dims)
            return self._make_rating(code, dims, summary, factors, errors)
        except Exception:
            return self._make_rating(code, dims, "评估出错", factors, errors)

    def _eval_value_alpha(self, code, errors, factors) -> Optional[EvalDimension]:
        try:
            r = self._get_realtime(code)
            if not r: return None
            score = 5.0
            pe = self._safe_float(r.pe)
            pb = self._safe_float(r.pb)
            if pe: factors["db_pe"] = pe
            if pb: factors["db_pb"] = pb
            if pe and pe < 10: score += 2.5
            elif pe and pe < 15: score += 1.5
            elif pe and pe > 30: score -= 1.5
            return EvalDimension("价值因子", min(10, max(0, score)), 0.25, f"PE={pe}")
        except Exception:
            return None

    def _eval_quality_alpha(self, code, errors, factors) -> Optional[EvalDimension]:
        try:
            fin = self._get_financials(code)
            if not fin: return None
            score = 5.0
            roe = self._safe_float(fin[0].roe)
            gm = self._safe_float(fin[0].gross_margin)
            if roe: factors["db_roe"] = roe
            if gm: factors["db_gm"] = gm
            if roe and roe > 20: score += 1.5
            if gm and gm > 60: score += 1.0
            if roe and roe < 5: score -= 1.5
            return EvalDimension("质量因子", min(10, max(0, score)), 0.20, f"ROE={roe}")
        except Exception:
            return None

    def _eval_momentum_alpha(self, code, errors, factors) -> Optional[EvalDimension]:
        try:
            kline = self._get_kline(code, count=120)
            if not kline or len(kline) < 60: return None
            score = 5.0
            closes = np.array([d.close for d in kline])
            ret_6m = (closes[-1] / closes[-120] - 1) * 100
            factors["db_mom_6m"] = round(ret_6m, 2)
            if ret_6m > 20: score += 2.0
            elif ret_6m > 10: score += 1.0
            elif ret_6m < -15: score -= 1.5
            return EvalDimension("动量因子", min(10, max(0, score)), 0.20, f"6m={ret_6m:.1f}%")
        except Exception:
            return None

    def _eval_lowvol_alpha(self, code, errors, factors) -> Optional[EvalDimension]:
        try:
            kline = self._get_kline(code, count=120)
            if not kline or len(kline) < 60: return None
            score = 5.0
            closes = np.array([d.close for d in kline])
            returns = np.diff(closes) / closes[:-1]
            vol = np.std(returns) * np.sqrt(252) * 100
            factors["db_vol"] = round(vol, 2)
            if vol < 25: score += 2.0; details = "低波"
            elif vol < 35: score += 1.0; details = "中低波"
            elif vol > 50: score -= 1.5; details = "高波"
            else: details = ""
            return EvalDimension("低波因子", min(10, max(0, score)), 0.20, details)
        except Exception:
            return None

    def _eval_size_alpha(self, code, errors, factors) -> Optional[EvalDimension]:
        try:
            r = self._get_realtime(code)
            if not r: return None
            mc = self._safe_float(r.market_cap)
            if mc:
                factors["db_market_cap"] = mc
                if mc > 1e11: return EvalDimension("规模因子", 8.0, 0.15, "大盘蓝筹")
                elif mc > 2e10: return EvalDimension("规模因子", 6.5, 0.15, "中盘")
                elif mc > 5e9: return EvalDimension("规模因子", 7.0, 0.15, "中小盘弹性")
            return None
        except Exception:
            return None

    def _generate_summary(self, dims: list) -> str:
        if not dims: return "数据不足以评估"
        score = sum(d.score * d.weight for d in dims) / sum(d.weight for d in dims)
        if score >= 7.5: return "Alpha多因子共振: 多因子发出积极信号"
        elif score >= 6.0: return "Alpha因子多数正面"
        elif score >= 4.0: return "Alpha因子混合信号"
        else: return "Alpha因子多数负面"
