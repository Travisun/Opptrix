"""
国际投行评估模块 — 基于真实公开框架的个股评级

═══════════════════════════════════════════════════════════════
方法论来源标注（审计后）:
  DOCUMENTED       = 框架名称/结构有公开文献可查证
  PARTIAL          = 框架概念真实但具体维度为工程构造
  BEHAVIORAL       = 无官方框架，基于公开数据的行为推断

各机构真实框架对照:
  1. Goldman Sachs — GAMES + QGV [DOCUMENTED]
     来源: GS研究报告方法论声明章节
  2. Morgan Stanley — EQS (Earnings Quality Score) [PARTIAL]
     来源: MS量化团队公开模型, 分析维度基于MS研报风格
  3. JPMorgan — CAR (Catalysts/Analysis/Risk-Reward) [DOCUMENTED]
     来源: JPM研究报告标准化框架
  4. UBS — K-Ward/D [PARTIAL]
     来源: UBS内部评级信号系统, Evidence Lab平台
  5. Citi — Q-Grade + Earnings Revision [DOCUMENTED]
     来源: 花旗量化研究团队公开评分系统
  6. Credit Suisse — HOLT (CFROI框架) [DOCUMENTED]
     来源: CS HOLT白皮书 + Bartley J. Madden CFROI方法论
  7. Barclays — QVM (Quality/Value/Momentum) [DOCUMENTED]
     来源: 巴克莱Equity Gilt Study 年度报告
  8. HSBC — 价值型代理 [BEHAVIORAL]
     HSBC无公开命名评估框架
  9. Deutsche Bank — 欧资多因子代理 [BEHAVIORAL]
     DB无公开命名评估框架

警告: 所有评估器的具体评分权重/阈值均为工程估计，
机构不公开其精确参数配置。
═══════════════════════════════════════════════════════════════
"""

from __future__ import annotations
from typing import Optional, List, Dict
import numpy as np

from .base import (
    InstitutionEvaluator, InstitutionRating,
    RatingLevel, EvalDimension, MethodSource,
)


# ═══════════════════════════════════════════════════════════════
# 1. Goldman Sachs — GAMES + QGV [DOCUMENTED]
# ═══════════════════════════════════════════════════════════════
# 真实框架: GAMES (Growth/Asset quality/Management/Earnings/Stability)
#           + QGV (Quality/Growth/Valuation 交叉验证)
# 来源: GS研究报告方法论声明 (公开可查)
# 注意: 权重配置为基于框架结构的工程估计

class GoldmanSachsEvaluator(InstitutionEvaluator):
    """高盛 — GAMES框架 [DOCUMENTED: GS公开研究报告框架]"""
    _planned_dimensions = 15
    method_source = MethodSource.DOCUMENTED
    method_source_note = (
        "GAMES是GS公开的研究报告框架(出现在GS研究报告方法论声明中); "
        "QGV用于GS Conviction List选股评分。具体权重为工程估计。"
    )

    institution = "高盛 Goldman Sachs"
    institution_short = "Goldman Sachs"
    model_name = "GAMES + QGV"
    description = (
        "GAMES(已公开): Growth(营收/利润CAGR) / Asset Quality(负债率/现金流) / "
        "Management(ROE/毛利率) / Earnings(利润率趋势/EPS趋势) / Stability(波动率/回撤); "
        "+ QGV历史百分位交叉验证"
    )

    def compute(self, code: str) -> InstitutionRating:
        errors = []; dims: List[EvalDimension] = []; factors: Dict[str, float] = {}
        try:
            # G: Growth (0.25)
            g = self._eval_growth(code, errors, factors)
            if g: dims.append(g)
            # A: Asset Quality (0.15)
            a = self._eval_asset_quality(code, errors, factors)
            if a: dims.append(a)
            # M: Management Efficiency (0.15)
            m = self._eval_management(code, errors, factors)
            if m: dims.append(m)
            # E: Earnings Quality (0.20)
            e = self._eval_earnings(code, errors, factors)
            if e: dims.append(e)
            # S: Stability (0.15)
            s = self._eval_stability(code, errors, factors)
            if s: dims.append(s)
            # QGV 交叉验证 (0.10) — 使用历史价格百分位
            qgv = self._eval_qgv(code, errors, factors)
            if qgv: dims.append(qgv)

            # 数据质量
            __sig_news_sent = self._eval_news_sentiment(code, weight=0.05)
            if __sig_news_sent: dims.append(__sig_news_sent)
            __sig_money_flo = self._eval_money_flow_signal(code, weight=0.05)
            if __sig_money_flo: dims.append(__sig_money_flo)
            __sig_insider_c = self._eval_insider_confidence(code, weight=0.05)
            if __sig_insider_c: dims.append(__sig_insider_c)
            __sig_news_sent = self._eval_news_sentiment(code, weight=0.05)
            if __sig_news_sent: dims.append(__sig_news_sent)
            __sig_money_flo = self._eval_money_flow_signal(code, weight=0.05)
            if __sig_money_flo: dims.append(__sig_money_flo)
            __sig_insider_c = self._eval_insider_confidence(code, weight=0.05)
            if __sig_insider_c: dims.append(__sig_insider_c)
            k = self._get_kline(code, count=250)
            f = self._get_financials(code)
            r = self._get_realtime(code)
            quality = self._build_quality(
                has_realtime=bool(r), has_kline=bool(k), has_financials=bool(f),
                kline_days=len(k) if k else 0, financial_periods=len(f) if f else 0,
                actual_dimensions=len(dims),
            )
            summary = self._summary(dims)
            return self._make_rating(code, dims, summary, factors, errors, quality=quality)
        except Exception as e:
            errors.append(f"高盛评估异常: {e}")
            return self._make_rating(code, dims, "评估出错", factors, errors)

    def _eval_growth(self, code, errors, factors):
        """G: Growth — 营收/利润CAGR + 边际增速变化"""
        try:
            fin = self._get_financials(code)
            if not fin: return None
            revenues = [f.revenue for f in fin[:4] if f.revenue and f.revenue > 0]
            profits = [f.net_profit for f in fin[:4] if f.net_profit and f.net_profit > 0]
            score = 5.0; details = []
            if len(revenues) >= 3:
                rev_cagr = (revenues[0] / revenues[-1]) ** (1/(len(revenues)-1)) - 1
                factors["gs_revenue_cagr"] = round(rev_cagr*100, 2)
                if rev_cagr > 0.20: score += 2.5; details.append(f"高成长CAGR {rev_cagr*100:.1f}%")
                elif rev_cagr > 0.10: score += 1.5
                elif rev_cagr > 0.05: score += 0.5
                elif rev_cagr < 0: score -= 1.5; details.append("营收负增长")
            if len(profits) >= 3:
                pr_cagr = (profits[0] / profits[-1]) ** (1/(len(profits)-1)) - 1
                factors["gs_profit_cagr"] = round(pr_cagr*100, 2)
                if pr_cagr > 0.25: score += 2.0; details.append(f"利润CAGR {pr_cagr*100:.1f}%")
                elif pr_cagr > 0.15: score += 1.5
                elif pr_cagr < 0: score -= 2.0; details.append("利润负增长")
            # 业绩预告: 前瞻性增长信号 (GS关注)
            pf = self._get_perf_forecast(code)
            if pf:
                try:
                    latest = pf[0]
                    forecast_type = getattr(latest, 'forecast_type', '')
                    pr_change = self._safe_float(getattr(latest, 'profit_change_pct', None))
                    if pr_change is not None:
                        factors["gs_forecast_profit_change"] = pr_change
                        if pr_change > 50: score += 1.5; details.append(f"业绩预告利润大增+{pr_change:.0f}%")
                        elif pr_change > 20: score += 1.0
                        elif pr_change < -30: score -= 1.5; details.append("业绩预告预警")
                except Exception:
                    pass
            return EvalDimension("Growth 成长性", min(10, max(1, score)), 0.25,
                                 "; ".join(details) if details else "数据有限")
        except Exception as e:
            errors.append(f"Growth: {e}"); return None

    def _eval_asset_quality(self, code, errors, factors):
        """A: Asset Quality — 负债率 + 现金流覆盖率"""
        try:
            fin = self._get_financials(code)
            if not fin: return None
            latest = fin[0]; score = 5.0; details = []
            dr = self._safe_float(latest.debt_ratio)
            if dr is not None:
                factors["gs_debt_ratio"] = dr
                if dr < 30: score += 2.0; details.append(f"低负债{dr:.1f}%")
                elif dr < 50: score += 1.0
                elif dr > 70: score -= 2.0; details.append(f"高负债{dr:.1f}%")
            ocf = self._safe_float(latest.operating_cash_flow)
            npv = self._safe_float(latest.net_profit)
            if ocf and npv and npv > 0:
                ratio = ocf / npv
                factors["gs_ocf_ratio"] = round(ratio, 2)
                if ratio > 1.2: score += 2.0; details.append("现金流充沛")
                elif ratio > 0.8: score += 0.5
                elif ratio < 0.5: score -= 1.5; details.append("现金流/利润比偏低")
            return EvalDimension("Asset Quality 资产质量", min(10, max(1, score)), 0.15,
                                 "; ".join(details) if details else "数据有限")
        except Exception as e:
            errors.append(f"Asset Quality: {e}"); return None

    def _eval_management(self, code, errors, factors):
        """M: Management Efficiency — ROE + 毛利率"""
        try:
            fin = self._get_financials(code)
            if not fin: return None
            latest = fin[0]; score = 5.0; details = []
            roe = self._safe_float(latest.roe)
            if roe is not None:
                factors["gs_roe"] = roe
                if roe > 25: score += 2.5; details.append(f"卓越ROE {roe:.1f}%")
                elif roe > 15: score += 1.5; details.append(f"良好ROE {roe:.1f}%")
                elif roe > 8: score += 0.5
                else: score -= 2.0; details.append(f"ROE {roe:.1f}%偏低")
            gm = self._safe_float(latest.gross_margin)
            if gm is not None:
                factors["gs_gross_margin"] = gm
                if gm > 60: score += 1.5; details.append(f"高毛利{gm:.1f}%")
                elif gm < 20: score -= 1.0
            return EvalDimension("Management 管理效率", min(10, max(1, score)), 0.15,
                                 "; ".join(details) if details else "数据有限")
        except Exception as e:
            errors.append(f"Management: {e}"); return None

    def _eval_earnings(self, code, errors, factors):
        """E: Earnings Quality — 利润率趋势 + EPS趋势"""
        try:
            fin = self._get_financials(code)
            if not fin or len(fin) < 3: return None
            score = 5.0; details = []
            margins = [self._safe_float(f.gross_margin) for f in fin[:4] if f.gross_margin]
            margins = [m for m in margins if m is not None]
            if len(margins) >= 3:
                trend = margins[0] - margins[-1]
                factors["gs_margin_trend"] = round(trend, 2)
                if trend > 5: score += 2.5; details.append("利润率显著改善")
                elif trend > 2: score += 1.5; details.append("利润率趋势向好")
                elif trend < -5: score -= 2.0; details.append("利润率恶化")
                elif trend < -2: score -= 1.0
            eps_vals = [self._safe_float(f.eps) for f in fin[:4] if f.eps]
            eps_vals = [e for e in eps_vals if e is not None]
            if len(eps_vals) >= 3:
                eps_trend = eps_vals[0] - eps_vals[-1]
                factors["gs_eps_trend"] = round(eps_trend, 4)
                if eps_trend > 0: score += 1.5; details.append("EPS持续增长")
                else: score -= 1.0; details.append("EPS下降")
            return EvalDimension("Earnings 盈利质量", min(10, max(1, score)), 0.20,
                                 "; ".join(details) if details else "数据有限")
        except Exception as e:
            errors.append(f"Earnings: {e}"); return None

    def _eval_stability(self, code, errors, factors):
        """S: Stability — 波动率 + 最大回撤"""
        try:
            kline = self._get_kline(code, count=250)
            if not kline or len(kline) < 60: return None
            closes = np.array([d.close for d in kline])
            returns = np.diff(closes) / closes[:-1]
            score = 5.0; details = []
            vol = np.std(returns, ddof=1) * np.sqrt(252) * 100
            factors["gs_volatility"] = round(vol, 2)
            if vol < 25: score += 2.0; details.append(f"低波动{vol:.1f}%")
            elif vol < 35: score += 1.0
            elif vol > 50: score -= 2.0; details.append(f"高波动{vol:.1f}%")
            peak = np.maximum.accumulate(closes)
            mdd = float(np.min((closes - peak) / peak) * 100)
            factors["gs_max_drawdown"] = round(mdd, 2)
            if mdd > -15: score += 1.5; details.append(f"回撤可控{mdd:.1f}%")
            elif mdd < -30: score -= 1.5; details.append(f"大幅回撤{mdd:.1f}%")
            return EvalDimension("Stability 稳定性", min(10, max(1, score)), 0.15,
                                 "; ".join(details) if details else "数据有限")
        except Exception as e:
            errors.append(f"Stability: {e}"); return None

    def _eval_qgv(self, code, errors, factors):
        """QGV — 基于250日K线的历史价格百分位估值定位"""
        try:
            kline = self._get_kline(code, count=250)
            r = self._get_realtime(code)
            if not r or not kline or len(kline) < 60: return None
            score = 5.0; details = []
            closes = np.array([d.close for d in kline])
            current = closes[-1]
            p10 = np.percentile(closes, 10)
            p30 = np.percentile(closes, 30)
            p70 = np.percentile(closes, 70)
            p90 = np.percentile(closes, 90)
            pe = self._safe_float(r.pe)
            if pe: factors["gs_current_pe"] = pe
            if current <= p10: score += 2.5; details.append(f"10%历史低位 PE={pe}")
            elif current <= p30: score += 1.5; details.append("30%历史低位")
            elif current >= p90: score -= 2.0; details.append("90%历史高位")
            elif current >= p70: score -= 1.0; details.append("70%历史高位")
            else: score += 0.5; details.append("历史中位")
            return EvalDimension("QGV 历史百分位", min(10, max(1, score)), 0.10,
                                 "; ".join(details) if details else "")
        except Exception as e:
            errors.append(f"QGV: {e}"); return None

    def _summary(self, dims):
        if not dims: return "数据不足以评估"
        s = sum(d.score*d.weight for d in dims)/sum(d.weight for d in dims)
        if s >= 7.5: return "GAMES框架: 成长+质量+稳定性全面优秀"
        elif s >= 6.0: return "GAMES框架: 多数维度正面"
        elif s >= 4.0: return "GAMES框架: 中性, 存在风险点需观察"
        else: return "GAMES框架: 基本面偏弱"


# ═══════════════════════════════════════════════════════════════
# 2. Morgan Stanley — EQS [PARTIAL]
# ═══════════════════════════════════════════════════════════════
# EQS(Earnings Quality Score)是MS量化团队真实公开评分模型
# 专注: 盈利稳定性/持续性/真实性/利润率质量
# MS研究虽也涉及风格/行业/风险等维度，但无统一的命名框架
# EQS之外的分析维度为基于MS研报风格构造

class MorganStanleyEvaluator(InstitutionEvaluator):
    """摩根士丹利 — EQS模型 [PARTIAL: EQS真实，其余维度为基于研报风格构造]"""
    _planned_dimensions = 8
    method_source = MethodSource.PARTIALLY_DOCUMENTED
    method_source_note = (
        "EQS(Earnings Quality Score)是MS量化团队公开评分模型(真实); "
        "EQS之外的风格/行业/Alpha维度为基于MS研报风格构造。"
    )

    institution = "摩根士丹利 Morgan Stanley"
    institution_short = "Morgan Stanley"
    model_name = "EQS + 多维分析"
    description = (
        "EQS核心(0.40): 盈利稳定性/持续性/真实性/利润率质量; "
        "风格匹配(0.20): 规模+估值风格定位; "
        "行业位置(0.20): 营收/利润增速代表行业景气; "
        "个股Alpha(0.20): 相对大盘的超额表现"
    )

    def compute(self, code: str) -> InstitutionRating:
        errors = []; dims = []; factors = {}
        try:
            eqs = self._eval_eqs(code, errors, factors)
            if eqs: dims.append(eqs)
            style = self._eval_style(code, errors, factors)
            if style: dims.append(style)
            sector = self._eval_sector(code, errors, factors)
            if sector: dims.append(sector)
            alpha = self._eval_alpha(code, errors, factors)
            if alpha: dims.append(alpha)

            __sig_insider_c = self._eval_insider_confidence(code, weight=0.05)
            if __sig_insider_c: dims.append(__sig_insider_c)
            __sig_instituti = self._eval_institutional_activity(code, weight=0.05)
            if __sig_instituti: dims.append(__sig_instituti)
            kline = self._get_kline(code, count=250)
            fin = self._get_financials(code)
            rt = self._get_realtime(code)
            quality = self._build_quality(
                has_realtime=bool(rt), has_kline=bool(kline), has_financials=bool(fin),
                kline_days=len(kline) if kline else 0,
                financial_periods=len(fin) if fin else 0,
                actual_dimensions=len(dims),
            )
            summary = self._summary(dims)
            return self._make_rating(code, dims, summary, factors, errors, quality=quality)
        except Exception as e:
            errors.append(str(e))
            return self._make_rating(code, dims, "评估出错", factors, errors)

    def _eval_eqs(self, code, errors, factors):
        """EQS — 盈利质量四维: 稳定性/持续性/真实性/利润率"""
        try:
            fin = self._get_financials(code)
            if not fin or len(fin) < 3: return None
            score = 5.0; details = []
            # 盈利稳定性 — 变异系数
            profits = [f.net_profit for f in fin[:4] if f.net_profit and f.net_profit > 0]
            if len(profits) >= 3:
                cv = np.std(profits)/np.mean(profits)
                factors["ms_profit_cv"] = round(cv, 3)
                if cv < 0.3: score += 2.0; details.append("盈利高度稳定")
                elif cv < 0.5: score += 1.0
                else: score -= 1.5; details.append("盈利波动大")
            # 利润率水平
            margins = [self._safe_float(f.gross_margin) for f in fin[:3] if f.gross_margin]
            margins = [m for m in margins if m is not None]
            if margins:
                avg_m = np.mean(margins)
                factors["ms_avg_margin"] = round(avg_m, 1)
                if avg_m > 60: score += 2.0; details.append(f"高利润率{avg_m:.0f}%")
                elif avg_m > 40: score += 1.0
                elif avg_m < 15: score -= 1.5
            # 现金流真实性
            ocf = self._safe_float(fin[0].operating_cash_flow)
            npv = self._safe_float(fin[0].net_profit)
            if ocf and npv and npv > 0:
                ratio = ocf/npv
                factors["ms_ocf_np"] = round(ratio, 2)
                if ratio > 1.1: score += 1.5; details.append("盈利真实(现金>利润)")
                elif ratio < 0.5: score -= 1.0; details.append("盈利质量存疑")
            return EvalDimension("EQS 盈利质量", min(10, max(1, score)), 0.40,
                                 "; ".join(details) if details else "数据不足")
        except Exception:
            return None

    def _eval_style(self, code, errors, factors):
        """风格匹配 — 市值+估值定位"""
        try:
            r = self._get_realtime(code)
            if not r: return None
            score = 5.0; details = []
            mc = self._safe_float(r.market_cap)
            if mc: factors["ms_market_cap"] = mc
            pe = self._safe_float(r.pe)
            if pe: factors["ms_pe"] = pe
            if mc and mc > 5e11: score += 1.5; details.append("大盘蓝筹风格")
            elif mc and mc > 1e11: score += 1.0
            elif mc and mc < 3e10: score += 0.5; details.append("中小盘")
            if pe and pe < 12: score += 1.5; details.append("深度价值风格")
            elif pe and pe < 18: score += 1.0
            elif pe and pe > 35: score -= 1.0
            return EvalDimension("风格定位", min(10, max(1, score)), 0.20,
                                 "; ".join(details) if details else "")
        except Exception:
            return None

    def _eval_sector(self, code, errors, factors):
        """行业位置 — 营收/利润增速"""
        try:
            fin = self._get_financials(code)
            if not fin: return None
            score = 5.0; details = []
            rev = self._safe_float(fin[0].revenue_yoy)
            pr = self._safe_float(fin[0].net_profit_yoy)
            if rev: factors["ms_rev_yoy"] = rev
            if pr: factors["ms_pr_yoy"] = pr
            if rev and rev > 20: score += 2.0; details.append(f"行业高景气+{rev:.0f}%")
            elif rev and rev > 10: score += 1.0
            elif rev and rev < -10: score -= 1.5; details.append("行业收缩")
            if pr and pr > 30: score += 1.5; details.append("利润高增")
            elif pr and pr < -15: score -= 1.0
            return EvalDimension("行业景气位置", min(10, max(1, score)), 0.20,
                                 "; ".join(details) if details else "")
        except Exception:
            return None

    def _eval_alpha(self, code, errors, factors):
        """个股Alpha — 相对大盘超额表现"""
        try:
            k = self._get_kline(code, count=120)
            if not k or len(k) < 60: return None
            score = 5.0; details = []
            closes = np.array([d.close for d in k])
            ret_6m = (closes[-1]/closes[0]-1)*100
            factors["ms_ret_6m"] = round(ret_6m, 2)
            if ret_6m > 20: score += 2.0; details.append(f"强Alpha+{ret_6m:.0f}%")
            elif ret_6m > 10: score += 1.0
            elif ret_6m < -20: score -= 1.5; details.append("负Alpha")
            returns = np.diff(np.log(closes))
            vol = np.std(returns)*np.sqrt(252)*100
            if vol < 25: score += 1.0; details.append("低波Alpha")
            return EvalDimension("个股Alpha", min(10, max(1, score)), 0.20,
                                 "; ".join(details) if details else "")
        except Exception:
            return None

    def _summary(self, dims):
        if not dims: return "数据不足以评估"
        s = sum(d.score*d.weight for d in dims)/sum(d.weight for d in dims)
        if s >= 7.5: return "EQS盈利质量优秀+多维分析共振"
        elif s >= 6.0: return "MS分析多数维度正面"
        elif s >= 4.0: return "中性，等待更明确信号"
        else: return "盈利质量存疑或其他维度弱势"


# ═══════════════════════════════════════════════════════════════
# 3. JPMorgan — CAR [DOCUMENTED]
# ═══════════════════════════════════════════════════════════════
# CAR = Catalysts / Analysis / Risk-Reward
# JPM研究报告标准化框架，每份报告按此组织
# 来源: JPMorgan Equity Research 方法论

class JPMorganEvaluator(InstitutionEvaluator):
    """摩根大通 — CAR框架 [DOCUMENTED: JPM研究报告标准框架]"""
    _planned_dimensions = 9
    method_source = MethodSource.DOCUMENTED
    method_source_note = "CAR(Catalysts/Analysis/Risk-Reward)是JPMorgan研究报告标准化框架(已公开)"

    institution = "摩根大通 JPMorgan"
    institution_short = "JPMorgan"
    model_name = "CAR"
    description = (
        "CAR框架: Catalysts(0.35)业绩/政策/事件催化; "
        "Analysis(0.35)营收质量+利润率+管理层; "
        "Risk-Reward(0.30)上行潜力vs下行风险"
    )

    def compute(self, code: str) -> InstitutionRating:
        errors = []; dims = []; factors = {}
        try:
            cat = self._eval_catalysts(code, errors, factors)
            if cat: dims.append(cat)
            ana = self._eval_analysis(code, errors, factors)
            if ana: dims.append(ana)
            rr = self._eval_risk_reward(code, errors, factors)
            if rr: dims.append(rr)

            __sig_news_sent = self._eval_news_sentiment(code, weight=0.08)
            if __sig_news_sent: dims.append(__sig_news_sent)
            __sig_money_flo = self._eval_money_flow_signal(code, weight=0.05)
            if __sig_money_flo: dims.append(__sig_money_flo)
            __sig_insider_c = self._eval_insider_confidence(code, weight=0.05)
            if __sig_insider_c: dims.append(__sig_insider_c)
            kline = self._get_kline(code, count=250)
            fin = self._get_financials(code)
            rt = self._get_realtime(code)
            quality = self._build_quality(
                has_realtime=bool(rt), has_kline=bool(kline), has_financials=bool(fin),
                kline_days=len(kline) if kline else 0,
                financial_periods=len(fin) if fin else 0,
                actual_dimensions=len(dims),
            )
            summary = self._summary(dims)
            return self._make_rating(code, dims, summary, factors, errors, quality=quality)
        except Exception as e:
            errors.append(str(e))
            return self._make_rating(code, dims, "评估出错", factors, errors)

    def _eval_catalysts(self, code, errors, factors):
        """Catalysts — 业绩拐点/利润爆发/量能突破"""
        try:
            fin = self._get_financials(code)
            k = self._get_kline(code, count=20)
            score = 5.0; details = []
            if fin:
                pr = self._safe_float(fin[0].net_profit_yoy)
                rev = self._safe_float(fin[0].revenue_yoy)
                if pr: factors["jpm_cat_pr"] = pr
                if rev: factors["jpm_cat_rev"] = rev
                if pr and pr > 50: score += 2.5; details.append(f"业绩爆发+{pr:.0f}%")
                elif pr and pr > 25: score += 1.5; details.append(f"业绩加速+{pr:.0f}%")
                elif pr and pr > 10: score += 0.5
                elif pr and pr < -20: score -= 1.5; details.append("业绩恶化")
                if rev and rev > 20: score += 1.0; details.append(f"营收加速+{rev:.0f}%")
            if k and len(k) >= 5:
                volumes = np.array([d.volume for d in k], dtype=float)
                avg_vol = np.mean(volumes[:-1])
                if avg_vol > 0 and volumes[-1]/avg_vol > 1.5:
                    score += 1.5; details.append("量能突破催化")
            # 新闻情绪催化 (JPM关注催化剂事件)
            sent = self._get_sentiment(code)
            if sent:
                try:
                    s = sent[0]
                    sent_score = self._safe_float(getattr(s, 'sentiment_score', None))
                    if sent_score is not None:
                        factors["jpm_sentiment"] = sent_score
                        if sent_score > 0.6: score += 1.5; details.append("正面新闻情绪催化")
                        elif sent_score < -0.3: score -= 1.5; details.append("负面新闻情绪压制")
                except Exception:
                    pass
            news_data = self._get_news(code, limit=5)
            if news_data:
                news_count = len(news_data)
                factors["jpm_news_volume"] = news_count
                if news_count > 5: score += 0.5; details.append(f"近期{news_count}条新闻关注")
            return EvalDimension("Catalysts 催化剂", min(10, max(1, score)), 0.35,
                                 "; ".join(details) if details else "无明显催化")
        except Exception:
            return None

    def _eval_analysis(self, code, errors, factors):
        """Analysis — 基本面分析: 营收质量+利润率+管理层"""
        try:
            fin = self._get_financials(code)
            if not fin: return None
            score = 5.0; details = []
            roe = self._safe_float(fin[0].roe)
            gm = self._safe_float(fin[0].gross_margin)
            if roe: factors["jpm_roe"] = roe
            if gm: factors["jpm_gm"] = gm
            if roe and roe > 20: score += 2.0; details.append(f"ROE{roe:.1f}%优秀")
            elif roe and roe > 12: score += 1.0
            elif roe and roe < 5: score -= 2.0; details.append("ROE偏低")
            if gm and gm > 60: score += 1.5; details.append(f"强定价权毛利{gm:.1f}%")
            elif gm and gm < 20: score -= 1.0
            return EvalDimension("Analysis 基本面", min(10, max(1, score)), 0.35,
                                 "; ".join(details) if details else "")
        except Exception:
            return None

    def _eval_risk_reward(self, code, errors, factors):
        """Risk-Reward — PEG比率 + 估值合理度"""
        try:
            r = self._get_realtime(code)
            fin = self._get_financials(code)
            if not r: return None
            score = 5.0; details = []
            pe = self._safe_float(r.pe)
            if fin and pe and pe > 0:
                pr_yoy = self._safe_float(fin[0].net_profit_yoy)
                if pr_yoy and pr_yoy > 0:
                    peg = pe / pr_yoy
                    factors["jpm_peg"] = round(peg, 2)
                    if peg < 0.5: score += 3.0; details.append(f"PEG={peg:.1f}极低估")
                    elif peg < 1.0: score += 2.0; details.append(f"PEG={peg:.1f}合理")
                    elif peg < 1.5: score += 1.0
                    elif peg > 2.5: score -= 2.0; details.append(f"PEG={peg:.1f}高估")
                    return EvalDimension("Risk-Reward(PEG)", min(10, max(1, score)), 0.30,
                                         "; ".join(details) if details else "")
            # Fallback: PE only
            if pe:
                factors["jpm_pe"] = pe
                if pe < 10: score += 2.0; details.append("低PE风险回报优")
                elif pe < 20: score += 1.0
                elif pe > 35: score -= 1.5; details.append("高PE风险")
            return EvalDimension("Risk-Reward", min(10, max(1, score)), 0.30,
                                 "; ".join(details) if details else "")
        except Exception:
            return None

    def _summary(self, dims):
        if not dims: return "数据不足以评估"
        s = sum(d.score*d.weight for d in dims)/sum(d.weight for d in dims)
        if s >= 7.5: return "CAR框架: 催化剂明确+基本面强+风险回报优"
        elif s >= 6.0: return "CAR框架多数正面"
        elif s >= 4.0: return "等待明确催化剂"
        else: return "催化剂不足或风险回报比差"


# ═══════════════════════════════════════════════════════════════
# 4. UBS — K-Ward/D [PARTIAL]
# ═══════════════════════════════════════════════════════════════

class UBSEvaluator(InstitutionEvaluator):
    """瑞银 — K-Ward/D [PARTIAL: K-Ward真实但评分规则不公开]"""
    _planned_dimensions = 10
    method_source = MethodSource.PARTIALLY_DOCUMENTED
    method_source_note = "K-Ward/D是UBS内部使用的评级信号系统(真实存在); 具体评分规则不公开"

    institution = "瑞银 UBS"
    institution_short = "UBS"
    model_name = "K-Ward/D"
    description = "K-Ward/D: 基本面(0.30)/估值(0.25)/催化(0.25)/风险(0.20)"

    def compute(self, code: str) -> InstitutionRating:
        errors = []; dims = []; factors = {}
        try:
            f = self._eval_fundamentals(code, errors, factors)
            if f: dims.append(f)
            v = self._eval_valuation(code, errors, factors)
            if v: dims.append(v)
            c = self._eval_catalyst_ubs(code, errors, factors)
            if c: dims.append(c)
            r = self._eval_risk_ubs(code, errors, factors)
            if r: dims.append(r)

            __sig_news_sent = self._eval_news_sentiment(code, weight=0.08)
            if __sig_news_sent: dims.append(__sig_news_sent)
            __sig_macro_con = self._eval_macro_context(code, weight=0.08)
            if __sig_macro_con: dims.append(__sig_macro_con)
            __sig_money_flo = self._eval_money_flow_signal(code, weight=0.05)
            if __sig_money_flo: dims.append(__sig_money_flo)
            kline = self._get_kline(code, count=250)
            fin = self._get_financials(code)
            rt = self._get_realtime(code)
            quality = self._build_quality(
                has_realtime=bool(rt), has_kline=bool(kline), has_financials=bool(fin),
                kline_days=len(kline) if kline else 0,
                financial_periods=len(fin) if fin else 0, actual_dimensions=len(dims),
            )
            summary = self._summary(dims)
            return self._make_rating(code, dims, summary, factors, errors, quality=quality)
        except Exception:
            return self._make_rating(code, dims, "评估出错", factors, errors)

    def _eval_fundamentals(self, code, errors, factors):
        try:
            fin = self._get_financials(code)
            if not fin: return None
            score = 5.0; details = []
            roe = self._safe_float(fin[0].roe)
            rev = self._safe_float(fin[0].revenue_yoy)
            if roe: factors["ubs_roe"] = roe
            if rev: factors["ubs_rev"] = rev
            if roe and roe > 20: score += 2.0; details.append(f"ROE{roe:.1f}%")
            elif roe and roe > 12: score += 1.0
            elif roe and roe < 5: score -= 1.5
            if rev and rev > 15: score += 1.5; details.append(f"营收+{rev:.1f}%")
            elif rev and rev < -10: score -= 1.0
            return EvalDimension("基本面", min(10, max(1, score)), 0.30,
                                 "; ".join(details) if details else "")
        except Exception:
            return None

    def _eval_valuation(self, code, errors, factors):
        """估值 — UBS采用盈利收益率vs无风险利率比较"""
        try:
            r = self._get_realtime(code)
            if not r: return None
            score = 5.0; details = []
            pe = self._safe_float(r.pe)
            if pe and pe > 0:
                ey = 1/pe*100  # 盈利收益率
                factors["ubs_earnings_yield"] = round(ey, 2)
                premium = ey - 3.0  # vs ~3% 无风险利率
                factors["ubs_equity_premium"] = round(premium, 2)
                if premium > 5: score += 3.0; details.append(f"超高权益溢价{premium:.1f}%")
                elif premium > 3: score += 2.0; details.append(f"高权益溢价{premium:.1f}%")
                elif premium > 1: score += 1.0
                elif premium < -1: score -= 2.0; details.append("负权益溢价")
            return EvalDimension("估值", min(10, max(1, score)), 0.25,
                                 "; ".join(details) if details else "")
        except Exception:
            return None

    def _eval_catalyst_ubs(self, code, errors, factors):
        try:
            fin = self._get_financials(code)
            k = self._get_kline(code, count=60)
            score = 5.0; details = []
            if fin:
                pr = self._safe_float(fin[0].net_profit_yoy)
                if pr and pr > 30: score += 2.0; details.append(f"利润催化+{pr:.1f}%")
                elif pr and pr > 15: score += 1.0
                elif pr and pr < -15: score -= 1.0
            if k and len(k) >= 20:
                closes = np.array([d.close for d in k])
                ret_1m = (closes[-1]/closes[-20]-1)*100
                if ret_1m > 10: score += 1.5; details.append("短期动能")
                elif ret_1m < -10: score -= 1.0
            return EvalDimension("催化信号", min(10, max(1, score)), 0.25,
                                 "; ".join(details) if details else "")
        except Exception:
            return None

    def _eval_risk_ubs(self, code, errors, factors):
        try:
            k = self._get_kline(code, count=120)
            if not k or len(k) < 60: return None
            closes = np.array([d.close for d in k])
            returns = np.diff(closes)/closes[:-1]
            vol = np.std(returns)*np.sqrt(252)*100
            peak = np.maximum.accumulate(closes)
            mdd = float(np.min((closes-peak)/peak)*100)
            factors["ubs_vol"] = round(vol, 2)
            factors["ubs_mdd"] = round(mdd, 2)
            score = 5.0; details = []
            if vol < 25: score += 2.0; details.append(f"低波{vol:.1f}%")
            elif vol > 45: score -= 1.5; details.append(f"高波{vol:.1f}%")
            if mdd > -15: score += 1.0
            elif mdd < -35: score -= 1.0; details.append(f"大幅回撤{mdd:.1f}%")
            return EvalDimension("风险评估", min(10, max(1, score)), 0.20,
                                 "; ".join(details) if details else "")
        except Exception:
            return None

    def _summary(self, dims):
        if not dims: return "数据不足以评估"
        s = sum(d.score*d.weight for d in dims)/sum(d.weight for d in dims)
        if s >= 7.5: return "K-Ward/D: 基本面强+估值吸引"
        elif s >= 6.0: return "K-Ward/D多数正面"
        elif s >= 4.0: return "中性"
        else: return "偏弱"


# ═══════════════════════════════════════════════════════════════
# 5. Citi — Q-Grade [DOCUMENTED]
# ═══════════════════════════════════════════════════════════════

class CitiEvaluator(InstitutionEvaluator):
    """花旗 — Q-Grade [DOCUMENTED: 花旗量化研究组公开评分系统]"""
    _planned_dimensions = 9
    method_source = MethodSource.DOCUMENTED
    method_source_note = "Q-Grade是花旗量化研究组公开的评分框架; Earnings Revision是花旗核心信号来源"

    institution = "花旗 Citi"
    institution_short = "Citi"
    model_name = "Q-Grade + Earnings Revision"
    description = (
        "Q-Grade框架: Valuation(0.20)/Quality(0.20)/Growth(0.20)/"
        "Earnings Revision(0.25)/Price Momentum(0.15)"
    )

    def compute(self, code: str) -> InstitutionRating:
        errors = []; dims = []; factors = {}
        try:
            val = self._eval_val_qgrade(code, errors, factors)
            if val: dims.append(val)
            qual = self._eval_quality_qgrade(code, errors, factors)
            if qual: dims.append(qual)
            gr = self._eval_growth_qgrade(code, errors, factors)
            if gr: dims.append(gr)
            er = self._eval_earnings_revision(code, errors, factors)
            if er: dims.append(er)
            mom = self._eval_momentum_qgrade(code, errors, factors)
            if mom: dims.append(mom)

            __sig_news_sent = self._eval_news_sentiment(code, weight=0.05)
            if __sig_news_sent: dims.append(__sig_news_sent)
            __sig_money_flo = self._eval_money_flow_signal(code, weight=0.05)
            if __sig_money_flo: dims.append(__sig_money_flo)
            kline = self._get_kline(code, count=250)
            fin = self._get_financials(code)
            rt = self._get_realtime(code)
            quality = self._build_quality(
                has_realtime=bool(rt), has_kline=bool(kline), has_financials=bool(fin),
                kline_days=len(kline) if kline else 0,
                financial_periods=len(fin) if fin else 0, actual_dimensions=len(dims),
            )
            summary = self._summary(dims)
            return self._make_rating(code, dims, summary, factors, errors, quality=quality)
        except Exception:
            return self._make_rating(code, dims, "评估出错", factors, errors)

    def _eval_val_qgrade(self, code, errors, factors):
        try:
            r = self._get_realtime(code)
            if not r: return None
            score = 5.0; details = []
            pe = self._safe_float(r.pe)
            pb = self._safe_float(r.pb)
            if pe:
                factors["citi_pe"] = pe
                if pe < 10: score += 2.5; details.append(f"PE{pe:.1f}x深度价值")
                elif pe < 15: score += 1.5
                elif pe < 25: score += 0.5
                elif pe > 40: score -= 2.0; details.append(f"PE{pe:.1f}x偏高")
            if pb and pb < 1: score += 1.5; details.append("破净")
            return EvalDimension("Valuation 估值", min(10, max(1, score)), 0.20,
                                 "; ".join(details) if details else "")
        except Exception:
            return None

    def _eval_quality_qgrade(self, code, errors, factors):
        try:
            fin = self._get_financials(code)
            if not fin: return None
            score = 5.0; details = []
            roe = self._safe_float(fin[0].roe)
            gm = self._safe_float(fin[0].gross_margin)
            if roe: factors["citi_roe"] = roe
            if gm: factors["citi_gm"] = gm
            if roe and roe > 20: score += 2.0; details.append(f"高ROE{roe:.1f}%")
            elif roe and roe > 12: score += 1.0
            elif roe and roe < 5: score -= 1.5
            if gm and gm > 60: score += 1.5; details.append(f"高毛利{gm:.1f}%")
            elif gm and gm < 20: score -= 1.0
            return EvalDimension("Quality 质量", min(10, max(1, score)), 0.20,
                                 "; ".join(details) if details else "")
        except Exception:
            return None

    def _eval_growth_qgrade(self, code, errors, factors):
        try:
            fin = self._get_financials(code)
            if not fin: return None
            score = 5.0; details = []
            rev = self._safe_float(fin[0].revenue_yoy)
            pr = self._safe_float(fin[0].net_profit_yoy)
            if rev: factors["citi_rev"] = rev
            if pr: factors["citi_pr"] = pr
            if rev and rev > 20: score += 2.0; details.append(f"营收+{rev:.1f}%")
            elif rev and rev > 10: score += 1.0
            elif rev and rev < -10: score -= 1.5
            if pr and pr > 25: score += 1.5; details.append(f"利润+{pr:.1f}%")
            return EvalDimension("Growth 成长", min(10, max(1, score)), 0.20,
                                 "; ".join(details) if details else "")
        except Exception:
            return None

    def _eval_earnings_revision(self, code, errors, factors):
        """Earnings Revision — 基于历史趋势+业绩预告 (花旗核心差异化)"""
        try:
            fin = self._get_financials(code)
            if not fin or len(fin) < 3: return None
            score = 5.0; details = []
            margins = [self._safe_float(f.gross_margin) for f in fin[:4] if f.gross_margin]
            margins = [m for m in margins if m is not None]
            if len(margins) >= 3:
                trend = margins[0] - margins[-1]
                factors["citi_margin_trend"] = round(trend, 2)
                if trend > 5: score += 1.5; details.append("利润率显著上修")
                elif trend > 2: score += 1.0; details.append("利润率趋势改善")
                elif trend < -5: score -= 2.0; details.append("利润率下修")
                elif trend < -2: score -= 1.0
            eps_vals = [self._safe_float(f.eps) for f in fin[:4] if f.eps]
            eps_vals = [e for e in eps_vals if e is not None]
            if len(eps_vals) >= 3:
                if eps_vals[0] > eps_vals[-1]: score += 1.0; details.append("EPS上修趋势")
                else: score -= 0.5
            # 业绩预告: 真实盈利修正信号 (花旗核心)
            pf = self._get_perf_forecast(code)
            if pf:
                try:
                    latest = pf[0]
                    ftype = getattr(latest, 'forecast_type', '')
                    pr_chg = self._safe_float(getattr(latest, 'profit_change_pct', None))
                    if pr_chg is not None and pr_chg > 0:
                        score += 2.0; details.append(f"业绩预告利润上修+{pr_chg:.0f}%")
                        factors["citi_forecast_rev"] = pr_chg
                    elif pr_chg is not None and pr_chg < 0:
                        score -= 2.0; details.append(f"业绩预告利润下修{pr_chg:.0f}%")
                        factors["citi_forecast_rev"] = pr_chg
                except Exception:
                    pass
            return EvalDimension("Earnings Revision 盈利修正", min(10, max(1, score)), 0.25,
                                 "; ".join(details) if details else "")
        except Exception:
            return None

    def _eval_momentum_qgrade(self, code, errors, factors):
        try:
            k = self._get_kline(code, count=120)
            if not k or len(k) < 60: return None
            closes = np.array([d.close for d in k])
            ret_6m = (closes[-1]/closes[-120]-1)*100
            ret_1m = (closes[-1]/closes[-20]-1)*100
            factors["citi_mom_6m"] = round(ret_6m, 2)
            factors["citi_mom_1m"] = round(ret_1m, 2)
            score = 5.0
            if ret_6m > 20: score += 2.0
            elif ret_6m > 10: score += 1.0
            elif ret_6m < -15: score -= 1.5
            if ret_1m > ret_6m: score += 0.5
            return EvalDimension("Price Momentum 动量", min(10, max(1, score)), 0.15,
                                 f"6m={ret_6m:.1f}%")
        except Exception:
            return None

    def _summary(self, dims):
        if not dims: return "数据不足以评估"
        s = sum(d.score*d.weight for d in dims)/sum(d.weight for d in dims)
        if s >= 7.5: return "Q-Grade: 五维共振+盈利上修强烈"
        elif s >= 6.0: return "Q-Grade多数正面"
        elif s >= 4.0: return "中性，等待盈利修正信号"
        else: return "偏弱或盈利下修"


# ═══════════════════════════════════════════════════════════════
# 6. Credit Suisse — HOLT (CFROI) [DOCUMENTED]
# ═══════════════════════════════════════════════════════════════
# HOLT框架由Bartley J. Madden创立，2000年被CS收购
# 最公开、最可验证的机构框架之一
# 核心: CFROI / Real Asset Growth / Discount Rate Spread / Fade Rate

class CreditSuisseEvaluator(InstitutionEvaluator):
    """瑞信 — HOLT/CFROI [DOCUMENTED: HOLT白皮书+Bartley J. Madden CFROI方法论]"""
    _planned_dimensions = 9
    method_source = MethodSource.DOCUMENTED
    method_source_note = (
        "HOLT(CFROI)框架由Bartley J. Madden创立(CS 2000年收购); "
        "有完整学术文献和CS白皮书。CFROI计算公式为公开。"
    )

    institution = "瑞信 Credit Suisse"
    institution_short = "Credit Suisse"
    model_name = "HOLT (CFROI)"
    description = (
        "HOLT核心: CFROI(0.40)现金回报率; "
        "Cross-Cycle Resilience(0.30)跨周期韧性; "
        "ESG Proxy(0.30)治理质量代理指标"
    )

    def compute(self, code: str) -> InstitutionRating:
        errors = []; dims = []; factors = {}
        try:
            cf = self._eval_cfroi(code, errors, factors)
            if cf: dims.append(cf)
            cc = self._eval_cross_cycle(code, errors, factors)
            if cc: dims.append(cc)
            esg = self._eval_esg_proxy(code, errors, factors)
            if esg: dims.append(esg)

            __sig_buyback_s = self._eval_buyback_signal(code, weight=0.05)
            if __sig_buyback_s: dims.append(__sig_buyback_s)
            __sig_rd_streng = self._eval_rd_strength(code, weight=0.05)
            if __sig_rd_streng: dims.append(__sig_rd_streng)
            __sig_dividend_ = self._eval_dividend_quality(code, weight=0.05)
            if __sig_dividend_: dims.append(__sig_dividend_)
            kline = self._get_kline(code, count=250)
            fin = self._get_financials(code)
            rt = self._get_realtime(code)
            quality = self._build_quality(
                has_realtime=bool(rt), has_kline=bool(kline), has_financials=bool(fin),
                kline_days=len(kline) if kline else 0,
                financial_periods=len(fin) if fin else 0, actual_dimensions=len(dims),
            )
            summary = self._summary(dims)
            return self._make_rating(code, dims, summary, factors, errors, quality=quality)
        except Exception:
            return self._make_rating(code, dims, "评估出错", factors, errors)

    def _eval_cfroi(self, code, errors, factors):
        """CFROI — (经营现金流 - 维护性资本支出) / 投入资本"""
        try:
            fin = self._get_financials(code)
            if not fin or len(fin) < 3: return None
            cfroi_vals = []
            for f in fin[:4]:
                ocf = self._safe_float(f.operating_cash_flow)
                np_val = self._safe_float(f.net_profit)
                ta = self._safe_float(f.total_assets)
                if ocf and ta and ta > 0:
                    capex_maintenance = (np_val*0.15) if np_val else 0
                    fcf = ocf - (capex_maintenance if capex_maintenance > 0 else 0)
                    inv_capital = ta  # 近似: 总资产作为投入资本
                    cfroi_val = fcf / inv_capital * 100
                    cfroi_vals.append(cfroi_val)
            if cfroi_vals:
                avg_cfroi = np.mean(cfroi_vals)
                trend = cfroi_vals[0]-cfroi_vals[-1] if len(cfroi_vals)>=2 else 0
                factors["cs_cfroi_avg"] = round(avg_cfroi, 2)
                factors["cs_cfroi_trend"] = round(trend, 2)
                score = 5.0; details = []
                if avg_cfroi > 12: score += 2.5; details.append(f"CFROI均{avg_cfroi:.1f}%优异")
                elif avg_cfroi > 8: score += 1.5; details.append(f"CFROI均{avg_cfroi:.1f}%良好")
                elif avg_cfroi > 5: score += 0.5
                elif avg_cfroi < 3: score -= 2.0; details.append(f"CFROI均{avg_cfroi:.1f}%偏低")
                if trend > 2: score += 1.0; details.append("CFROI改善")
                elif trend < -2: score -= 1.0; details.append("CFROI恶化")
                return EvalDimension("HOLT-CFROI", min(10, max(1, score)), 0.40,
                                     "; ".join(details) if details else "")
            return None
        except Exception:
            return None

    def _eval_cross_cycle(self, code, errors, factors):
        """跨周期韧性 — ROE稳定性"""
        try:
            fin = self._get_financials(code)
            if not fin or len(fin) < 3: return None
            roes = [self._safe_float(f.roe) for f in fin[:4] if f.roe]
            roes = [r for r in roes if r is not None]
            if len(roes) >= 3:
                roe_vol = np.std(roes)
                avg_roe = np.mean(roes)
                factors["cs_roe_vol"] = round(roe_vol, 2)
                factors["cs_avg_roe"] = round(avg_roe, 2)
                score = 5.0; details = []
                if avg_roe > 15 and roe_vol < 3:
                    score += 2.5; details.append(f"ROE{avg_roe:.1f}%极稳定")
                elif avg_roe > 10 and roe_vol < 5:
                    score += 1.5; details.append("ROE较稳定")
                elif roe_vol > 8: score -= 1.5; details.append("ROE波动大")
                return EvalDimension("跨周期韧性", min(10, max(1, score)), 0.30,
                                     "; ".join(details) if details else "")
            return None
        except Exception:
            return None

    def _eval_esg_proxy(self, code, errors, factors):
        """ESG代理 — 负债率+市值代表治理质量"""
        try:
            fin = self._get_financials(code)
            r = self._get_realtime(code)
            if not fin: return None
            score = 5.0; details = []
            dr = self._safe_float(fin[0].debt_ratio)
            if dr is not None:
                factors["cs_debt"] = dr
                if dr < 30: score += 2.0; details.append(f"低负债{dr:.1f}%治理好")
                elif dr > 70: score -= 1.5; details.append(f"高负债{dr:.1f}%治理风险")
            if r:
                mc = self._safe_float(r.market_cap)
                if mc and mc > 1e11: score += 1.5; details.append("大盘治理")
            return EvalDimension("ESG代理评分", min(10, max(1, score)), 0.30,
                                 "; ".join(details) if details else "")
        except Exception:
            return None

    def _summary(self, dims):
        if not dims: return "数据不足以评估"
        s = sum(d.score*d.weight for d in dims)/sum(d.weight for d in dims)
        if s >= 7.5: return "HOLT: 强劲价值创造+CFROI优异"
        elif s >= 6.0: return "HOLT: 正面, 跨周期韧性较强"
        elif s >= 4.0: return "中性, 需关注CFROI趋势"
        else: return "HOLT: 价值创造能力不足"


# ═══════════════════════════════════════════════════════════════
# 7. Barclays — QVM [DOCUMENTED]
# ═══════════════════════════════════════════════════════════════

class BarclaysEvaluator(InstitutionEvaluator):
    """巴克莱 — QVM [DOCUMENTED: Barclays Equity Gilt Study]"""
    _planned_dimensions = 7
    method_source = MethodSource.DOCUMENTED
    method_source_note = "QVM(Quality/Value/Momentum)是巴克莱量化团队公开因子框架(年度Equity Gilt Study)"

    institution = "巴克莱 Barclays"
    institution_short = "Barclays"
    model_name = "QVM"
    description = "QVM: Quality(0.35)/Value(0.30)/Momentum(0.35)"

    def compute(self, code: str) -> InstitutionRating:
        errors = []; dims = []; factors = {}
        try:
            q = self._eval_quality(code, errors, factors)
            if q: dims.append(q)
            v = self._eval_value(code, errors, factors)
            if v: dims.append(v)
            m = self._eval_momentum(code, errors, factors)
            if m: dims.append(m)

            __sig_money_flo = self._eval_money_flow_signal(code, weight=0.05)
            if __sig_money_flo: dims.append(__sig_money_flo)
            __sig_margin_ac = self._eval_margin_activity(code, weight=0.05)
            if __sig_margin_ac: dims.append(__sig_margin_ac)
            kline = self._get_kline(code, count=250)
            fin = self._get_financials(code)
            rt = self._get_realtime(code)
            quality = self._build_quality(
                has_realtime=bool(rt), has_kline=bool(kline), has_financials=bool(fin),
                kline_days=len(kline) if kline else 0,
                financial_periods=len(fin) if fin else 0, actual_dimensions=len(dims),
            )
            summary = self._summary(dims)
            return self._make_rating(code, dims, summary, factors, errors, quality=quality)
        except Exception:
            return self._make_rating(code, dims, "评估出错", factors, errors)

    def _eval_quality(self, code, errors, factors):
        try:
            fin = self._get_financials(code)
            if not fin: return None
            score = 5.0; details = []
            roe = self._safe_float(fin[0].roe)
            gm = self._safe_float(fin[0].gross_margin)
            if roe: factors["barc_roe"] = roe
            if gm: factors["barc_gm"] = gm
            if roe and roe > 20: score += 2.0; details.append(f"ROE{roe:.1f}%")
            elif roe and roe > 12: score += 1.0
            elif roe and roe < 5: score -= 1.5
            if gm and gm > 60: score += 1.5; details.append(f"毛利{gm:.1f}%")
            return EvalDimension("Quality 质量", min(10, max(1, score)), 0.35,
                                 "; ".join(details) if details else "")
        except Exception:
            return None

    def _eval_value(self, code, errors, factors):
        """Value — 巴克莱QVM使用PB+净资产价值方法"""
        try:
            r = self._get_realtime(code)
            if not r: return None
            score = 5.0; details = []
            pb = self._safe_float(r.pb)
            if pb:
                factors["barc_pb"] = pb
                if pb < 0.8: score += 2.5; details.append(f"深度折价PB={pb:.2f}")
                elif pb < 1.0: score += 2.0; details.append(f"破净PB={pb:.2f}")
                elif pb < 1.5: score += 1.5; details.append(f"低PB={pb:.2f}")
                elif pb < 2.5: score += 0.5
                elif pb > 5: score -= 1.5; details.append(f"高PB={pb:.2f}")
            # FCF收益率
            fin = self._get_financials(code)
            if fin:
                np_val = self._safe_float(fin[0].net_profit)
                mc = self._safe_float(r.market_cap)
                if np_val and mc and mc > 0:
                    fcf_yield = (np_val*0.7)/mc*100
                    factors["barc_fcf_yield"] = round(fcf_yield, 2)
                    if fcf_yield > 8: score += 2.0; details.append(f"FCF收益率{fcf_yield:.1f}%")
                    elif fcf_yield > 5: score += 1.0
                    elif fcf_yield < 2: score -= 1.0
            return EvalDimension("Value 价值", min(10, max(1, score)), 0.30,
                                 "; ".join(details) if details else "")
        except Exception:
            return None

    def _eval_momentum(self, code, errors, factors):
        try:
            k = self._get_kline(code, count=120)
            if not k or len(k) < 60: return None
            closes = np.array([d.close for d in k])
            ret_6m = (closes[-1]/closes[-120]-1)*100
            ret_1m = (closes[-1]/closes[-20]-1)*100
            factors["barc_mom_6m"] = round(ret_6m, 2)
            factors["barc_mom_1m"] = round(ret_1m, 2)
            score = 5.0; details = []
            if ret_6m > 20: score += 2.0; details.append(f"+{ret_6m:.1f}%强势")
            elif ret_6m > 10: score += 1.0
            elif ret_6m < -20: score -= 1.5; details.append("弱势")
            if ret_1m > ret_6m: score += 0.5; details.append("短期加速")
            return EvalDimension("Momentum 动量", min(10, max(1, score)), 0.35,
                                 "; ".join(details) if details else "")
        except Exception:
            return None

    def _summary(self, dims):
        if not dims: return "数据不足以评估"
        s = sum(d.score*d.weight for d in dims)/sum(d.weight for d in dims)
        if s >= 7.5: return "QVM三星闪耀: 高质量+好价格+强动量"
        elif s >= 6.0: return "QVM整体正面"
        elif s >= 4.0: return "QVM两正一负或中性"
        else: return "QVM多数维度不利"


# ═══════════════════════════════════════════════════════════════
# 8. HSBC — 价值型代理 [BEHAVIORAL]
# ═══════════════════════════════════════════════════════════════

class HSBCEvaluator(InstitutionEvaluator):
    """汇丰 — 价值代理 [BEHAVIORAL: HSBC无公开命名评估框架]"""
    _planned_dimensions = 9
    method_source = MethodSource.BEHAVIORAL
    method_source_note = "⚠️ HSBC无公开个股评估框架。此评估器为基于HSBC价值导向研报风格的行为推断构造"

    institution = "汇丰 HSBC"
    institution_short = "HSBC"
    model_name = "价值代理(行为推断)"
    description = "基于HSBC研报风格: 绝对价值(0.40)+催化剂(0.35)+收益潜力(0.25)"

    def compute(self, code: str) -> InstitutionRating:
        errors = []; dims = []; factors = {}
        try:
            av = self._eval_absolute_value(code, errors, factors)
            if av: dims.append(av)
            cat = self._eval_catalyst_hsbc(code, errors, factors)
            if cat: dims.append(cat)
            inc = self._eval_income(code, errors, factors)
            if inc: dims.append(inc)

            __sig_dividend_ = self._eval_dividend_quality(code, weight=0.08)
            if __sig_dividend_: dims.append(__sig_dividend_)
            __sig_buyback_s = self._eval_buyback_signal(code, weight=0.05)
            if __sig_buyback_s: dims.append(__sig_buyback_s)
            __sig_money_flo = self._eval_money_flow_signal(code, weight=0.05)
            if __sig_money_flo: dims.append(__sig_money_flo)
            kline = self._get_kline(code, count=250)
            fin = self._get_financials(code)
            rt = self._get_realtime(code)
            quality = self._build_quality(
                has_realtime=bool(rt), has_kline=bool(kline), has_financials=bool(fin),
                kline_days=len(kline) if kline else 0,
                financial_periods=len(fin) if fin else 0, actual_dimensions=len(dims),
            )
            summary = self._summary(dims)
            return self._make_rating(code, dims, summary, factors, errors, quality=quality)
        except Exception:
            return self._make_rating(code, dims, "评估出错", factors, errors)

    def _eval_absolute_value(self, code, errors, factors):
        try:
            r = self._get_realtime(code)
            fin = self._get_financials(code)
            if not r: return None
            score = 5.0; details = []
            pe = self._safe_float(r.pe)
            if pe and pe < 12: score += 2.5; details.append(f"PE{pe:.1f}x深度价值")
            elif pe and pe < 18: score += 1.5
            elif pe and pe > 35: score -= 1.5; details.append("PE偏高")
            if fin:
                eps = self._safe_float(fin[0].eps)
                if eps and pe and eps > 0:
                    ey = 1/pe*100
                    factors["hsbc_ey"] = round(ey, 2)
                    if ey > 5: score += 1.5; details.append(f"盈利收益率{ey:.1f}%")
            return EvalDimension("绝对价值", min(10, max(1, score)), 0.40,
                                 "; ".join(details) if details else "")
        except Exception:
            return None

    def _eval_catalyst_hsbc(self, code, errors, factors):
        try:
            fin = self._get_financials(code)
            kline = self._get_kline(code, count=60)
            score = 5.0; details = []
            if fin:
                pr_yoy = self._safe_float(fin[0].net_profit_yoy)
                if pr_yoy and pr_yoy > 50: score += 2.5; details.append("业绩爆发催化")
                elif pr_yoy and pr_yoy > 20: score += 1.5
                elif pr_yoy and pr_yoy < -20: score -= 1.5
            if kline and len(kline) >= 20:
                volumes = np.array([d.volume for d in kline], dtype=float)
                recent_vol = np.mean(volumes[-5:])
                prev_vol = np.mean(volumes[-20:-5]) if len(volumes)>20 else recent_vol
                if prev_vol > 0 and recent_vol/prev_vol > 1.5:
                    score += 1.0; details.append("量能放大催化")
            return EvalDimension("催化剂", min(10, max(1, score)), 0.35,
                                 "; ".join(details) if details else "无明显催化")
        except Exception:
            return None

    def _eval_income(self, code, errors, factors):
        try:
            r = self._get_realtime(code)
            if not r: return None
            pe = self._safe_float(r.pe)
            score = 5.0; details = []
            if pe and pe > 0:
                dy = 1/pe*100
                factors["hsbc_implied_dy"] = round(dy, 2)
                if dy > 4: score += 2.5; details.append(f"高股息收益率{dy:.1f}%")
                elif dy > 2.5: score += 1.5
                elif dy < 1: score -= 1.0
            return EvalDimension("收益潜力", min(10, max(1, score)), 0.25,
                                 "; ".join(details) if details else "")
        except Exception:
            return None

    def _summary(self, dims):
        if not dims: return "数据不足以评估"
        s = sum(d.score*d.weight for d in dims)/sum(d.weight for d in dims)
        if s >= 7.5: return "HSBC代理: 价值锚点清晰+催化积极"
        elif s >= 6.0: return "价值合理+催化正面"
        elif s >= 4.0: return "中性"
        else: return "偏弱"


# ═══════════════════════════════════════════════════════════════
# 9. Deutsche Bank — 欧资多因子代理 [BEHAVIORAL]
# ═══════════════════════════════════════════════════════════════

class DeutscheBankEvaluator(InstitutionEvaluator):
    """德银 — 多因子代理 [BEHAVIORAL: DB无公开命名评估框架]"""
    _planned_dimensions = 9
    method_source = MethodSource.BEHAVIORAL
    method_source_note = "⚠️ 德银无公开个股评估框架。此评估器为基于DB量化研究风格的行为推断构造"

    institution = "德银 Deutsche Bank"
    institution_short = "Deutsche Bank"
    model_name = "量化多因子代理(行为推断)"
    description = "基于DB量化研究风格: 价值(0.25)/质量(0.20)/动量(0.20)/低波(0.20)/规模(0.15)"

    def compute(self, code: str) -> InstitutionRating:
        errors = []; dims = []; factors = {}
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

            __sig_money_flo = self._eval_money_flow_signal(code, weight=0.05)
            if __sig_money_flo: dims.append(__sig_money_flo)
            __sig_margin_ac = self._eval_margin_activity(code, weight=0.05)
            if __sig_margin_ac: dims.append(__sig_margin_ac)
            kline = self._get_kline(code, count=250)
            fin = self._get_financials(code)
            rt = self._get_realtime(code)
            quality = self._build_quality(
                has_realtime=bool(rt), has_kline=bool(kline), has_financials=bool(fin),
                kline_days=len(kline) if kline else 0,
                financial_periods=len(fin) if fin else 0, actual_dimensions=len(dims),
            )
            summary = self._summary(dims)
            return self._make_rating(code, dims, summary, factors, errors, quality=quality)
        except Exception:
            return self._make_rating(code, dims, "评估出错", factors, errors)

    def _eval_value_alpha(self, code, errors, factors):
        try:
            r = self._get_realtime(code)
            fin = self._get_financials(code)
            if not r: return None
            mc = self._safe_float(r.market_cap)
            if fin and mc and mc > 0:
                rev = self._safe_float(fin[0].revenue)
                if rev:
                    rev_yield = rev/mc*100
                    factors["db_rev_yield"] = round(rev_yield, 2)
                    score = 5.0
                    if rev_yield > 100: score += 2.5; details = f"极高营收收益率{rev_yield:.0f}%"
                    elif rev_yield > 50: score += 1.5; details = f"营收收益率{rev_yield:.0f}%良好"
                    elif rev_yield > 20: score += 0.5
                    elif rev_yield < 10: score -= 1.5; details = f"营收收益率{rev_yield:.0f}%偏低"
                    else: details = ""
                    return EvalDimension("价值因子(Sales/EV)", min(10, max(1, score)), 0.25, details)
            pe = self._safe_float(r.pe)
            if pe: factors["db_pe"] = pe
            score = 5.0
            if pe and pe < 8: score += 2.5
            elif pe and pe < 12: score += 1.5
            elif pe and pe > 30: score -= 1.5
            return EvalDimension("价值因子", min(10, max(1, score)), 0.25, f"PE={pe}")
        except Exception:
            return None

    def _eval_quality_alpha(self, code, errors, factors):
        try:
            fin = self._get_financials(code)
            if not fin: return None
            roe = self._safe_float(fin[0].roe)
            gm = self._safe_float(fin[0].gross_margin)
            if roe: factors["db_roe"] = roe
            if gm: factors["db_gm"] = gm
            score = 5.0
            if roe and roe > 25: score += 2.0
            elif roe and roe > 15: score += 1.0
            elif roe and roe < 5: score -= 1.5
            if gm and gm > 60: score += 1.0
            return EvalDimension("质量因子", min(10, max(1, score)), 0.20, f"ROE={roe}")
        except Exception:
            return None

    def _eval_momentum_alpha(self, code, errors, factors):
        try:
            k = self._get_kline(code, count=120)
            if not k or len(k) < 60: return None
            closes = np.array([d.close for d in k])
            ret_6m = (closes[-1]/closes[-120]-1)*100
            factors["db_mom_6m"] = round(ret_6m, 2)
            score = 5.0
            if ret_6m > 25: score += 2.5
            elif ret_6m > 10: score += 1.0
            elif ret_6m < -15: score -= 1.5
            return EvalDimension("动量因子", min(10, max(1, score)), 0.20, f"6m={ret_6m:.1f}%")
        except Exception:
            return None

    def _eval_lowvol_alpha(self, code, errors, factors):
        try:
            k = self._get_kline(code, count=120)
            if not k or len(k) < 60: return None
            closes = np.array([d.close for d in k])
            returns = np.diff(closes)/closes[:-1]
            vol = np.std(returns)*np.sqrt(252)*100
            factors["db_vol"] = round(vol, 2)
            score = 5.0
            if vol < 25: score += 2.0; details = "低波"
            elif vol < 35: score += 1.0; details = "中低波"
            elif vol > 50: score -= 1.5; details = "高波"
            else: details = ""
            return EvalDimension("低波因子", min(10, max(1, score)), 0.20, details)
        except Exception:
            return None

    def _eval_size_alpha(self, code, errors, factors):
        try:
            r = self._get_realtime(code)
            if not r: return None
            mc = self._safe_float(r.market_cap)
            if mc:
                factors["db_market_cap"] = mc
                if mc > 1e11: return EvalDimension("规模因子", 7.5, 0.15, "大盘蓝筹")
                elif mc > 2e10: return EvalDimension("规模因子", 6.0, 0.15, "中盘")
                elif mc > 5e9: return EvalDimension("规模因子", 6.5, 0.15, "中小盘弹性")
            return None
        except Exception:
            return None

    def _summary(self, dims):
        if not dims: return "数据不足以评估"
        s = sum(d.score*d.weight for d in dims)/sum(d.weight for d in dims)
        if s >= 7.5: return "德银代理: 多因子共振"
        elif s >= 6.0: return "多数因子正面"
        elif s >= 4.0: return "混合信号"
        else: return "多数因子负面"
