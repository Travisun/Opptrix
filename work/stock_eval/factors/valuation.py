from __future__ import annotations
"""
估值因子 — 估值衍生指标

覆盖:
  pe_percentile    — PE 历史百分位
  pb_percentile    — PB 历史百分位
  dividend_yield   — 股息率
  peg              — PEG (基于近3年净利润CAGR)
"""

from typing import Optional
import numpy as np

from .base import BaseFactor
from ..core.models import FactorMeta, FactorResult, FactorCategory
from ..core.registry import register_factor


@register_factor
class PEBand(BaseFactor):
    """PE 处于近 5 年历史估值的百分位"""
    meta = FactorMeta(
        name="pe_percentile",
        category=FactorCategory.VALUATION,
        description="PE 处于近5年历史估值的百分位",
        unit="%",
        higher_is_better=False,  # 百分位越低越好（相对便宜）
        requires_financials=True,
        requires_kline=True,
        min_value=0,
        max_value=100,
    )

    def compute(self, code: str) -> Optional[FactorResult]:
        try:
            # 取近5年日K线
            k = self._de.kline(code, period="daily", count=1200)
            if not k.success or not k.data:
                return None

            closes = np.array([d.close for d in k.data])
            # 用近5年最高/最低价来估算PE百分位
            # 实际PE需要取财务数据+股价计算，这里用close作为PE的代理
            # 更精确: 用每股收益(eps)来计算PE
            fin = self._de.financials(code)
            if fin.success and fin.data:
                latest_eps = fin.data[0].eps
                if latest_eps and latest_eps > 0:
                    current_price = closes[-1]
                    current_pe = current_price / latest_eps
                    # 从K线估算历史PE
                    hist_pe = closes / latest_eps
                    pct = float(np.sum(hist_pe < current_pe) / len(hist_pe) * 100)
                    return FactorResult(
                        name="pe_percentile",
                        value=round(pct, 1),
                        meta=self.meta,
                        details={"current_pe": round(float(current_pe), 2),
                                 "eps": round(float(latest_eps), 4),
                                 "kline_days": len(k.data)}
                    )
            return None
        except Exception:
            return None


@register_factor
class PBBand(BaseFactor):
    """PB 历史百分位（代理算法）"""
    meta = FactorMeta(
        name="pb_percentile",
        category=FactorCategory.VALUATION,
        description="PB 处于近5年历史估值的百分位",
        unit="%",
        higher_is_better=False,
        requires_financials=True,
        requires_kline=True,
    )

    def compute(self, code: str) -> Optional[FactorResult]:
        try:
            fin = self._de.financials(code)
            if not fin.success or not fin.data:
                return None
            latest = fin.data[0]
            # 每股净资产 ≈ equity / shares，用close/bps估算PB
            # 这里简化: 用市净率=price/每股净资产
            # balance_sheet可以拿到净资产，但没有流通股数
            # 用财报的eps + 股价估算
            k = self._de.kline(code, period="daily", count=1200)
            if not k.success or not k.data:
                return None

            closes = np.array([d.close for d in k.data])
            current_price = closes[-1]
            eps = latest.eps or 0
            if eps <= 0:
                return None

            # 近似PB，假设净资产收益率ROE来反推
            roe = latest.roe or 0
            if roe <= 0:
                return None
            # BPS = EPS / ROE
            bps = eps / roe
            current_pb = current_price / bps if bps > 0 else 0
            if current_pb <= 0:
                return None

            hist_pb = closes / bps
            pct = float(np.sum(hist_pb < current_pb) / len(hist_pb) * 100)
            return FactorResult(
                name="pb_percentile",
                value=round(pct, 1),
                meta=self.meta,
                details={"current_pb": round(float(current_pb), 2),
                         "bps": round(float(bps), 2)}
            )
        except Exception:
            return None


@register_factor
class DividendYield(BaseFactor):
    """股息率 — 近12个月每股分红 / 当前股价"""
    meta = FactorMeta(
        name="dividend_yield",
        category=FactorCategory.VALUATION,
        description="近12个月股息率 = 每股分红 / 股价",
        unit="%",
        higher_is_better=True,
        requires_financials=True,
        requires_realtime=True,
    )

    def compute(self, code: str) -> Optional[FactorResult]:
        try:
            div = self._de.dividend(code)
            if not div.success or not div.data:
                return None

            r = self._de.realtime(code)
            if not r.success or not r.data:
                return None
            price = r.data[0].price
            if not price or price <= 0:
                return None

            # 取最近一次分红
            latest = div.data[0]
            cash_bonus = latest.cash_bonus or 0
            if cash_bonus <= 0:
                return None

            yield_pct = (cash_bonus / price) * 100
            return FactorResult(
                name="dividend_yield",
                value=round(float(yield_pct), 2),
                meta=self.meta,
                details={"cash_bonus_per_share": cash_bonus,
                         "current_price": price,
                         "year": latest.year}
            )
        except Exception:
            return None


@register_factor
class PEGRatio(BaseFactor):
    """PEG — PE / 近3年净利润CAGR"""
    meta = FactorMeta(
        name="peg",
        category=FactorCategory.VALUATION,
        description="PEG = PE / 近3年净利润CAGR，<1 可能低估",
        unit="倍",
        higher_is_better=False,
        requires_financials=True,
        requires_realtime=True,
    )

    def compute(self, code: str) -> Optional[FactorResult]:
        try:
            fin = self._de.financials(code)
            if not fin.success or len(fin.data) < 3:
                return None

            r = self._de.realtime(code)
            if not r.success or not r.data:
                return None
            price = r.data[0].price
            eps = r.data[0].pe if hasattr(r.data[0], 'pe') else None
            if not eps or eps <= 0 or not price:
                eps = fin.data[0].eps
                if not eps or eps <= 0:
                    return None
                pe = price / eps
            else:
                pe = eps  # data.pe is actually PE ratio

            # 取3年净利润计算CAGR
            profits = [f.net_profit for f in fin.data[:4] if f.net_profit]
            if len(profits) < 3:
                return None

            # 从最近3期算CAGR
            profits = profits[:3]
            if profits[0] <= 0 or profits[-1] <= 0:
                return None

            years = len(profits) - 1
            cagr = (profits[0] / profits[-1]) ** (1 / years) - 1
            if cagr <= 0:
                return None

            peg = pe / (cagr * 100)
            return FactorResult(
                name="peg",
                value=round(float(peg), 2),
                meta=self.meta,
                details={"pe": round(float(pe), 2),
                         "profit_cagr_3y": round(float(cagr * 100), 2),
                         "net_profits": [round(float(p), 2) for p in profits[:3]]}
            )
        except Exception:
            return None
