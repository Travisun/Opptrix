"""
北向资金评估模块 - 外资通过沪深港通投资A股的偏好与评估逻辑

########################################################################
源文件说明 - 透明性标注:

  北向资金并非单一机构, 而是通过沪深港通渠道投资A股的
  境外机构投资者集合。以下评估逻辑基于:

  [ok] 公开统计数据
       - 北向资金实际持仓数据 (沪深港通每日披露)
       - 港交所/沪深交易所公开的持股统计
       - MSCI/FTSE纳入A股权重数据

  [ok] 外资机构整体行为特征
       - 偏好大盘蓝筹、高流动性标的
       - 注重公司治理和ESG
       - 估值对标全球可比公司

  [~] 各维度的权重和阈值
       - 基于持仓统计特征的系统化构造
       - 标注为"偏好模型"以明确这是基于行为推断

北向资金特征:
  - 偏好大盘蓝筹(MSCI/FTSE权重股)
  - 高ROE+高流动性
  - 外资持股比例趋势比绝对比例更重要
  - 注重ESG/公司治理
  - 估值与全球可比公司对标
  - 对汇率和全球利率敏感
"""

from __future__ import annotations
from typing import Optional, List, Dict
import numpy as np

from .base import (
    InstitutionEvaluator, InstitutionRating,
    RatingLevel, EvalDimension, MethodSource,
)


class NorthboundFundEvaluator(InstitutionEvaluator):
    """北向资金 — 外资投资偏好 [来源: 行为推断]"""
    method_source = MethodSource.BEHAVIORAL
    method_source_note = "基于沪深港通公开持股数据(每日披露)的统计归纳; 非单一机构框架"

    institution = "北向资金 Northbound"
    institution_short = "北向资金"
    model_name = "北向偏好模型"
    description = (
        "北向资金偏好: 大盘蓝筹(25%)/高ROE质量(25%)/"
        "估值对标全球(20%)/景气趋势(15%)/外资增持趋势(15%)"
    )

    def compute(self, code: str) -> InstitutionRating:
        errors = []
        dims: List[EvalDimension] = []
        factors: Dict[str, float] = {}
        try:
            sz = self._eval_market_cap(code, errors, factors)
            if sz: dims.append(sz)

            q = self._eval_quality_nb(code, errors, factors)
            if q: dims.append(q)

            v = self._eval_global_valuation(code, errors, factors)
            if v: dims.append(v)

            g = self._eval_growth_nb(code, errors, factors)
            if g: dims.append(g)

            flow = self._eval_flow_trend(code, errors, factors)
            if flow: dims.append(flow)

            summary = self._generate_summary(dims)
            return self._make_rating(code, dims, summary, factors, errors)
        except Exception as e:
            errors.append(f"北向评估异常: {e}")
            return self._make_rating(code, dims, "评估出错", factors, errors)

    def _eval_market_cap(self, code, errors, factors) -> Optional[EvalDimension]:
        """大盘蓝筹偏好 25%"""
        try:
            r = self._get_realtime(code)
            if not r: return None
            score = 5.0; details = []
            mc = self._safe_float(r.market_cap)
            if mc:
                factors["nb_mc"] = mc
                if mc > 1e12:
                    score = 9.0; details.append("万亿市值核心资产")
                elif mc > 5e11:
                    score = 8.0; details.append("超大盘MSCI权重")
                elif mc > 1e11:
                    score = 7.0; details.append("大盘蓝筹")
                elif mc > 5e10:
                    score = 6.0
                elif mc > 2e10:
                    score = 5.0
                else:
                    score = 3.0; details.append("不在北向偏好范围")

            # 流动性
            amt = self._safe_float(r.amount)
            if amt:
                factors["nb_amount"] = amt
                if amt > 1e10:
                    score += 1.0; details.append("极高流动性")
                elif amt > 2e9:
                    score += 0.5
                elif amt < 3e8:
                    score -= 1.0; details.append("流动性不足")

            return EvalDimension("大盘蓝筹偏好", min(10, max(0, score)), 0.25,
                                 "; ".join(details) if details else "")
        except Exception:
            return None

    def _eval_quality_nb(self, code, errors, factors) -> Optional[EvalDimension]:
        """高质量偏好 25% — 外资关注ROE+盈利质量"""
        try:
            fin = self._get_financials(code)
            if not fin: return None
            score = 5.0; details = []
            roe = self._safe_float(fin[0].roe)
            if roe:
                factors["nb_roe"] = roe
                if roe > 20:
                    score += 2.5; details.append(f"ROE{roe:.1f}% 外资最爱")
                elif roe > 15:
                    score += 1.5; details.append(f"ROE{roe:.1f}% 良好")
                elif roe > 10:
                    score += 0.5
                elif roe < 5:
                    score -= 1.5; details.append("ROE不足")

            # 现金流质量
            ocf = self._safe_float(fin[0].operating_cash_flow)
            npv = self._safe_float(fin[0].net_profit)
            if ocf and npv and npv > 0:
                ratio = ocf / npv
                factors["nb_ocf_np"] = round(ratio, 2)
                if ratio > 1:
                    score += 1.5; details.append("现金流充裕")
                elif ratio < 0.5:
                    score -= 1.0; details.append("现金流/利润不匹配")

            # 毛利率(代表定价权)
            gm = self._safe_float(fin[0].gross_margin)
            if gm:
                factors["nb_gm"] = gm
                if gm > 60: score += 1.0; details.append(f"高毛利{gm:.1f}%")

            return EvalDimension("高质量偏好", min(10, max(0, score)), 0.25,
                                 "; ".join(details) if details else "")
        except Exception:
            return None

    def _eval_global_valuation(self, code, errors, factors) -> Optional[EvalDimension]:
        """全球估值对标 20%"""
        try:
            r = self._get_realtime(code)
            fin = self._get_financials(code)
            if not r: return None
            score = 5.0; details = []
            pe = self._safe_float(r.pe)
            pb = self._safe_float(r.pb)

            if pe:
                factors["nb_pe"] = pe
                # 外资喜欢PE>10但<40(有一定溢价但不过分)
                if 10 <= pe <= 25:
                    score += 1.5; details.append(f"PE{pe:.1f}x 全球合理")
                elif 8 <= pe < 10:
                    score += 2.0; details.append(f"PE{pe:.1f}x 偏低(全球价值)")
                elif pe < 8:
                    score += 1.0; details.append(f"PE{pe:.1f}x 需警惕价值陷阱")
                elif 25 < pe <= 40:
                    score += 0; details.append(f"PE{pe:.1f}x 溢价可接受")
                else:
                    score -= 1.5; details.append(f"PE{pe:.1f}x 偏高")

            if roe := (self._safe_float(fin[0].roe) if fin else None):
                if pe and roe:
                    # PEG-like: PE/ROE
                    per = pe / roe if roe > 0 else 0
                    factors["nb_pe_roe"] = round(per, 2)
                    if per < 1:
                        score += 1.5; details.append("PE/ROE<1 全球极具吸引力")
                    elif per < 2:
                        score += 0.5

            return EvalDimension("全球估值对标", min(10, max(0, score)), 0.20,
                                 "; ".join(details) if details else "")
        except Exception:
            return None

    def _eval_growth_nb(self, code, errors, factors) -> Optional[EvalDimension]:
        """景气趋势 15%"""
        try:
            fin = self._get_financials(code)
            if not fin: return None
            score = 5.0; details = []
            rev = self._safe_float(fin[0].revenue_yoy)
            pr = self._safe_float(fin[0].net_profit_yoy)
            if rev and rev > 15:
                score += 1.5; details.append(f"营收+{rev:.1f}%")
            elif rev and rev < -10:
                score -= 1.5; details.append("营收下滑")
            if pr and pr > 20:
                score += 1.5; details.append(f"利润+{pr:.1f}%")
            elif pr and pr < -20:
                score -= 1.5
            return EvalDimension("景气趋势", min(10, max(0, score)), 0.15,
                                 "; ".join(details) if details else "")
        except Exception:
            return None

    def _eval_flow_trend(self, code, errors, factors) -> Optional[EvalDimension]:
        """外资增持趋势代理 15%"""
        try:
            k = self._get_kline(code, count=120)
            r = self._get_realtime(code)
            if not k or len(k) < 60: return None
            score = 5.0; details = []

            # 用量价趋势作为外资关注的代理
            closes = np.array([d.close for d in k])
            volumes = np.array([d.volume for d in k], dtype=float)

            # 价格趋势
            ret_3m = (closes[-1] / closes[-60] - 1) * 100
            factors["nb_ret_3m"] = round(ret_3m, 2)

            if -5 < ret_3m < 15:
                score += 1.5; details.append("温和上涨趋势")
            elif ret_3m > 15:
                score += 1.0; details.append("强势上涨")
            elif ret_3m < -15:
                score -= 1.5; details.append("下跌趋势")

            # 相对强度(相对沪深300)
            try:
                idx = self._de.index_kline("000300", "daily", count=60)
                if idx and idx.success and idx.data and len(idx.data) >= 2:
                    idx_c = np.array([d.close for d in idx.data])
                    idx_r = (idx_c[-1] / idx_c[0] - 1) * 100
                    rel_strength = ret_3m - idx_r
                    factors["nb_rel_strength"] = round(rel_strength, 2)
                    if rel_strength > 10:
                        score += 1.5; details.append("相对大盘强势")
                    elif rel_strength < -10:
                        score -= 1.0; details.append("相对大盘弱势")
            except Exception:
                pass

            return EvalDimension("外资偏好趋势", min(10, max(0, score)), 0.15,
                                 "; ".join(details) if details else "")
        except Exception:
            return None

    def _generate_summary(self, dims: list) -> str:
        if not dims: return "数据不足以评估"
        s = sum(d.score * d.weight for d in dims) / sum(d.weight for d in dims)
        if s >= 7.5: return "北向资金高度偏好: 大盘蓝筹+高质量+全球估值合理"
        elif s >= 6.0: return "北向资金偏好匹配: 符合外资选股标准"
        elif s >= 4.0: return "北向资金偏好部分匹配"
        else: return "非北向资金典型配置标的"
