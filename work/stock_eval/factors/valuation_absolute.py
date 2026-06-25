from __future__ import annotations
"""
绝对估值因子 — DCF / DDM / 剩余收益 / 可比估值

将估值结果作为因子注册到系统，参与评分。

覆盖:
  dcf_margin        — DCF 估值相对于当前价的偏离度
  ddm_margin        — 股息折现估值的偏离度
  residual_income   — 剩余收益模型估值偏离度
  relative_value    — 可比公司相对估值偏离度
"""

from typing import Optional, List
import numpy as np
from dataclasses import dataclass

from .base import BaseFactor
from ..core.models import FactorMeta, FactorResult, FactorCategory
from ..core.registry import register_factor


@dataclass
class DCFInputs:
    """DCF 模型输入参数"""
    fcf: float                          # 最近12个月自由现金流
    shares: float = 1.0                 # 总股本
    wacc: float = 0.10                  # WACC
    growth_rate: float = 0.08           # 预测期增长率
    terminal_growth: float = 0.03       # 永续增长率
    forecast_years: int = 5             # 预测年限
    cash: float = 0.0                   # 现金及等价物
    debt: float = 0.0                   # 总负债
    minority: float = 0.0              # 少数股东权益


def dcf_model(d: DCFInputs) -> float:
    """
    DCF 两阶段模型

    第一阶段: 预测期 FCF 折现
    第二阶段: 终值折现 (Gordon Growth Model)
    """
    # 第一阶段: 预测期现金流
    pv_fcf = 0.0
    growth = d.growth_rate
    for year in range(1, d.forecast_years + 1):
        fcf_year = d.fcf * (1 + growth) ** year
        pv_fcf += fcf_year / (1 + d.wacc) ** year
        # 增长率在预测期每年衰减到 terminal_growth
        growth = d.growth_rate - (
            d.growth_rate - d.terminal_growth
        ) * (year / d.forecast_years)

    # 第二阶段: 终值
    terminal_fcf = d.fcf * (1 + d.terminal_growth) ** (d.forecast_years + 1)
    terminal_value = terminal_fcf / (d.wacc - d.terminal_growth)
    pv_terminal = terminal_value / (1 + d.wacc) ** d.forecast_years

    # 企业价值 → 股权价值
    ev = pv_fcf + pv_terminal
    equity = ev - d.debt + d.cash - d.minority
    per_share = equity / d.shares if d.shares > 0 else 0

    return float(per_share)


def ddm_model(dividends: List[float],
              shares: float,
              cost_of_equity: float = 0.10,
              terminal_growth: float = 0.03) -> float:
    """
    DDM 股息折现 — Gordon Growth 简化版

    假设未来股息按 terminal_growth 永续增长。
    """
    if not dividends or not shares:
        return 0.0
    latest_dps = dividends[0] / shares if dividends[0] else 0
    if latest_dps <= 0:
        return 0.0
    if cost_of_equity <= terminal_growth:
        return 0.0
    value = latest_dps * (1 + terminal_growth) / (cost_of_equity - terminal_growth)
    return float(value)


def residual_income_model(bvps: float, roe: float,
                          cost_of_equity: float = 0.10,
                          years: int = 10) -> float:
    """
    剩余收益模型 (Residual Income / EVA)

    V = B0 + sum((ROE - r) * B_{t-1} / (1+r)^t)

    简化版: 假设ROE逐年收敛到r
    """
    if bvps <= 0 or roe <= 0:
        return 0.0

    value = bvps
    book = bvps
    decay = (roe - cost_of_equity) / years

    for year in range(1, years + 1):
        ri = (roe - cost_of_equity) * book
        if ri < 0:
            ri = 0
        value += ri / (1 + cost_of_equity) ** year

        # 账面价值增长
        retained = roe * book * 0.5  # 假设50%留存
        book += retained

        # ROE 向均值收敛
        roe -= decay
        if roe < cost_of_equity:
            roe = cost_of_equity

    return float(value)


def _safe_get(engine, method, *args, **kwargs):
    """安全的数据层调用"""
    try:
        result = getattr(engine, method)(*args, **kwargs)
        return result
    except Exception:
        return type("R", (), {"success": False})()


# ── DCF 估值因子 ────────────────────────────────────

@register_factor
class DCFMargin(BaseFactor):
    """DCF 估值偏离度 = (DCF估值 - 当前价) / 当前价"""
    meta = FactorMeta(
        name="dcf_margin",
        category=FactorCategory.VALUATION,
        description="DCF估值相对于当前价的偏离度，正值被低估",
        unit="%",
        higher_is_better=True,  # 正值越大越低估
        requires_financials=True,
        requires_realtime=True,
    )

    def compute(self, code: str) -> Optional[FactorResult]:
        try:
            # 获取数据
            r = self._de.realtime(code)
            if not r.success or not r.data:
                return None
            price = r.data[0].price
            mcap = r.data[0].market_cap or 0
            if not price or price <= 0:
                return None

            # 财务数据
            fin = self._de.financials(code)
            if not fin.success or not fin.data:
                return None
            roe_val = fin.data[0].roe or 0
            eps = fin.data[0].eps or 0

            # 现金流量表获取FCF
            cf = self._de.cash_flow(code)
            fcf = 0
            if cf.success and cf.data:
                fcf = cf.data[0].free_cash_flow or 0

            # 资产负债表
            bs = self._de.balance_sheet(code)
            cash, debt = 0, 0
            if bs.success and bs.data:
                cash = bs.data[0].cash or 0
                debt = (bs.data[0].short_term_borrowing or 0) + \
                       (bs.data[0].long_term_borrowing or 0)

            # 流通股数
            shares = mcap / price if price > 0 else 0

            # DCF 计算
            wacc = 0.10
            growth = min(max(roe_val * 0.6, 0.03), 0.20)

            if fcf > 0 and shares > 0:
                dcf_input = DCFInputs(
                    fcf=fcf, shares=shares,
                    wacc=wacc, growth_rate=growth,
                    cash=cash, debt=debt,
                )
                dcf_value = dcf_model(dcf_input)
                if dcf_value > 0:
                    margin = (dcf_value - price) / price * 100
                    return FactorResult(
                        name="dcf_margin",
                        value=round(float(margin), 2),
                        meta=self.meta,
                        details={
                            "dcf_value": round(float(dcf_value), 2),
                            "current_price": round(float(price), 2),
                            "fcf": round(float(fcf), 0),
                            "wacc": wacc,
                            "growth_rate": round(growth * 100, 1),
                        }
                    )
            return None
        except Exception:
            return None


# ── 剩余收益估值因子 ────────────────────────────────

@register_factor
class ResidualIncomeMargin(BaseFactor):
    """剩余收益估值偏离度"""
    meta = FactorMeta(
        name="residual_income_margin",
        category=FactorCategory.VALUATION,
        description="剩余收益模型估值偏离度，正值被低估",
        unit="%",
        higher_is_better=True,
        requires_financials=True,
        requires_realtime=True,
    )

    def compute(self, code: str) -> Optional[FactorResult]:
        try:
            r = self._de.realtime(code)
            if not r.success or not r.data:
                return None
            price = r.data[0].price
            if not price or price <= 0:
                return None

            fin = self._de.financials(code)
            if not fin.success or not fin.data:
                return None
            roe_val = fin.data[0].roe or 0
            eps = fin.data[0].eps or 0

            # BPS 估算: EPS / ROE
            if roe_val <= 0 or eps <= 0:
                return None
            bvps = eps / roe_val

            cost_of_equity = 0.10
            ri_value = residual_income_model(
                bvps, roe_val, cost_of_equity
            )
            if ri_value <= 0:
                return None

            margin = (ri_value - price) / price * 100
            return FactorResult(
                name="residual_income_margin",
                value=round(float(margin), 2),
                meta=self.meta,
                details={
                    "ri_value": round(float(ri_value), 2),
                    "current_price": round(float(price), 2),
                    "bvps": round(float(bvps), 2),
                    "roe": round(float(roe_val), 2),
                }
            )
        except Exception:
            return None


# ── 可比相对估值因子 ────────────────────────────────

@register_factor
class RelativeValue(BaseFactor):
    """
    相对估值偏离度

    将当前 PE 与同行业上市公司均值对比。
    正值表示相对同行被低估。
    """
    meta = FactorMeta(
        name="relative_value",
        category=FactorCategory.VALUATION,
        description="相对同行PE的偏离度，正值相对被低估",
        unit="%",
        higher_is_better=True,
        requires_financials=True,
        requires_realtime=True,
    )

    def compute(self, code: str) -> Optional[FactorResult]:
        try:
            r = self._de.realtime(code)
            if not r.success or not r.data:
                return None
            price = r.data[0].price
            current_pe = r.data[0].pe

            if not current_pe or current_pe <= 0:
                fin = self._de.financials(code)
                if not fin.success or not fin.data:
                    return None
                eps = fin.data[0].eps or 0
                if eps <= 0:
                    return None
                current_pe = price / eps

            # 获取可比公司
            peers = self._de.peer_companies(code)
            if not peers.success or not peers.data:
                return None

            # 收集同行PE
            peer_pes = []
            for peer in peers.data[:10]:
                try:
                    pr = self._de.realtime(peer.peer_code)
                    if pr.success and pr.data and pr.data[0].pe:
                        pe_val = pr.data[0].pe
                        if 0 < pe_val < 200:  # 过滤异常值
                            peer_pes.append(pe_val)
                except Exception:
                    continue

            if len(peer_pes) < 3:
                return None

            mean_pe = np.mean(peer_pes)
            deviation = (mean_pe - current_pe) / mean_pe * 100

            return FactorResult(
                name="relative_value",
                value=round(float(deviation), 2),
                meta=self.meta,
                details={
                    "current_pe": round(float(current_pe), 2),
                    "peer_mean_pe": round(float(mean_pe), 2),
                    "peer_count": len(peer_pes),
                }
            )
        except Exception:
            return None
