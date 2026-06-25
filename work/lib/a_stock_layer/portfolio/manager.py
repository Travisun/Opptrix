"""
持仓管理器 — 记录交易、计算盈亏（移动加权平均法）

算法说明（符合A股券商标准）:
- 买入: 加权平均成本 = (原持仓市值 + 买入金额 + 费用) / (原股数 + 买入股数)
- 卖出: 已实现盈亏 = (卖出价 - 成本价) × 卖出股数 - 费用
- 浮动盈亏: (当前价 - 成本价) × 持仓股数
"""

from __future__ import annotations

import logging
from typing import List, Optional, Tuple

from .models import HoldingPosition, PnLSummary, TradeRecord, TradeSide
from .store import PortfolioStore

logger = logging.getLogger("a_stock_layer.portfolio")


def _calc_fees(amount: float, trade_side: str,
                config: dict = None) -> Tuple[float, float, float]:
    """计算A股交易费用。

    Args:
        amount: 成交金额
        trade_side: "buy" / "sell"
        config: 费率配置，来自 PortfolioStore.get_config() 或 get_stock_config()
                含 commission_rate, commission_min, stamp_duty_rate, transfer_fee_rate

    Returns:
        (commission, stamp_duty, transfer_fee)
    """
    cfg = config or {}
    comm_rate = cfg.get("commission_rate", 0.00025)
    comm_min = cfg.get("commission_min", 5.0)
    sd_rate = cfg.get("stamp_duty_rate", 0.0005)
    tf_rate = cfg.get("transfer_fee_rate", 0.00001)

    commission = max(amount * comm_rate, comm_min)
    stamp_duty = amount * sd_rate if trade_side == "sell" else 0
    transfer_fee = amount * tf_rate
    return round(commission, 2), round(stamp_duty, 2), round(transfer_fee, 2)


def _calc_pnl_for_stock(trades: List[TradeRecord],
                        current_price: float) -> HoldingPosition:
    """按移动加权平均法计算一只股票的持仓和盈亏。

    Args:
        trades: 该股票全部交易（按日期升序）
        current_price: 当前市价

    Returns:
        HoldingPosition
    """
    shares = 0.0
    total_cost = 0.0     # 持仓总成本（股数×成本均价，不含已卖出部分）
    realized_pnl = 0.0   # 该股累计已实现盈亏

    for t in trades:
        if t.trade_side == "buy":
            # 买入: 加权平均
            cost_to_add = t.amount + t.total_fee
            total_cost += cost_to_add
            shares += t.shares
        else:  # sell
            if shares <= 0:
                continue
            # 卖出比例
            sell_shares = min(t.shares, shares)
            avg_cost = total_cost / shares if shares > 0 else 0
            # 已实现盈亏 = (卖出价 - 成本价) × 股数 - 费用
            realized = (t.price - avg_cost) * sell_shares - t.total_fee
            realized_pnl += realized
            # 减少持仓
            cost_to_remove = avg_cost * sell_shares
            total_cost -= cost_to_remove
            shares -= sell_shares

    # 当前持仓
    cost_basis = total_cost / shares if shares > 0 else 0
    market_value = shares * current_price
    unrealized_pnl = market_value - total_cost
    unrealized_pnl_pct = (unrealized_pnl / total_cost * 100) if total_cost > 0 else 0
    total_pnl = unrealized_pnl + realized_pnl
    total_pnl_pct = (total_pnl / (total_cost + abs(realized_pnl)) * 100) if total_cost > 0 or realized_pnl != 0 else 0

    code = trades[0].code if trades else ""
    name = trades[0].name if trades else ""

    return HoldingPosition(
        code=code, name=name,
        shares=round(shares, 2),
        cost_basis=round(cost_basis, 3),
        total_cost=round(total_cost, 2),
        current_price=round(current_price, 2),
        market_value=round(market_value, 2),
        unrealized_pnl=round(unrealized_pnl, 2),
        unrealized_pnl_pct=round(unrealized_pnl_pct, 2),
        realized_pnl=round(realized_pnl, 2),
        total_pnl=round(total_pnl, 2),
        total_pnl_pct=round(total_pnl_pct, 2),
    )


class PortfolioManager:
    """持仓管理 — 记录交易、查看持仓、计算盈亏"""

    def __init__(self, engine=None):
        self._store = PortfolioStore()
        self._engine = engine  # AshareEngine 实例，用于获取实时价格

    # ── 用户操作 ──────────────────────────────────────────────────

    def buy(self, code: str, shares: float, price: float,
            date: str = "", name: str = "",
            commission: float = -1, stamp_duty: float = -1,
            transfer_fee: float = -1) -> TradeRecord:
        """记录一次买入。

        Args:
            code: 股票代码 "600519"
            shares: 买入股数
            price: 成交单价
            date: 交易日期 "2024-12-20"，留空取当天
            name: 股票名称，留空自动获取
            commission: 佣金（元），-1 自动按配置费率计算
            stamp_duty: 印花税（元），-1 自动
            transfer_fee: 过户费（元），-1 自动
        """
        if not date:
            from datetime import date as d
            date = d.today().isoformat()
        amount = round(shares * price, 2)

        # 取费率配置（优先股票专属，其次全局）
                # 合并全局+股票专属，股票专属 None 值不覆盖全局
        _sc = self._store.get_stock_config(code)
        cfg = {**self._store.get_config(), **{k: v for k, v in _sc.items() if v is not None}}
        if commission == -1:
            comm, sd, tf = _calc_fees(amount, "buy", cfg)
        else:
            comm = commission
            sd = stamp_duty if stamp_duty >= 0 else 0
            tf = transfer_fee if transfer_fee >= 0 else 0

        # 自动获取股票名称
        if not name and self._engine:
            try:
                r = self._engine.realtime(code)
                if r.success and r.data:
                    name = r.data[0].name
            except Exception:
                pass

        code_norm = code.strip().zfill(6)
        rec = TradeRecord(
            code=code_norm, name=name,
            trade_side="buy", shares=shares, price=price,
            amount=amount, commission=comm, stamp_duty=sd,
            transfer_fee=tf, total_fee=round(comm + sd + tf, 2),
            trade_date=date,
        )
        rec.id = self._store.add_trade(rec)
        return rec

    def sell(self, code: str, shares: float, price: float,
             date: str = "", name: str = "",
             commission: float = -1, stamp_duty: float = -1,
             transfer_fee: float = -1) -> TradeRecord:
        """记录一次卖出。"""
        if not date:
            from datetime import date as d
            date = d.today().isoformat()
        amount = round(shares * price, 2)

                # 合并全局+股票专属，股票专属 None 值不覆盖全局
        _sc = self._store.get_stock_config(code)
        cfg = {**self._store.get_config(), **{k: v for k, v in _sc.items() if v is not None}}
        if commission == -1:
            comm, sd, tf = _calc_fees(amount, "sell", cfg)
        else:
            comm = commission
            sd = stamp_duty if stamp_duty >= 0 else 0
            tf = transfer_fee if transfer_fee >= 0 else 0

        if not name and self._engine:
            try:
                r = self._engine.realtime(code)
                if r.success and r.data:
                    name = r.data[0].name
            except Exception:
                pass

        code_norm = code.strip().zfill(6)
        rec = TradeRecord(
            code=code_norm, name=name,
            trade_side="sell", shares=shares, price=price,
            amount=amount, commission=comm, stamp_duty=sd,
            transfer_fee=tf, total_fee=round(comm + sd + tf, 2),
            trade_date=date,
        )
        rec.id = self._store.add_trade(rec)
        return rec

    def remove_trade(self, trade_id: int) -> bool:
        """删除一条交易记录。"""
        return self._store.delete_trade(trade_id)

    def clear(self) -> int:
        """清空全部交易记录。"""
        return self._store.clear_all()

    # ── 查询 ──────────────────────────────────────────────────────

    def trades(self, code: str = "") -> List[TradeRecord]:
        """查询交易记录。"""
        return self._store.get_trades(code)

    def holdings(self, refresh_prices: bool = True) -> List[HoldingPosition]:
        """查询当前持仓及盈亏。

        Args:
            refresh_prices: 是否用实时行情刷新市价

        Returns:
            持仓列表（含盈亏数据）
        """
        all_trades = self._store.get_trades()
        if not all_trades:
            return []

        # 按股票代码分组
        from collections import defaultdict
        by_code: dict = defaultdict(list)
        for t in all_trades:
            by_code[t.code].append(t)

        results = []
        for code, trades in by_code.items():
            trades.sort(key=lambda x: x.trade_date)

            # 获取当前价
            current_price = 0.0
            if refresh_prices and self._engine:
                try:
                    r = self._engine.realtime(code)
                    if r.success and r.data:
                        current_price = r.data[0].price or 0
                        # 更新股票名称
                        name = r.data[0].name
                        for t in trades:
                            if not t.name and name:
                                pass
                except Exception:
                    pass

            pos = _calc_pnl_for_stock(trades, current_price)
            if pos.shares > 0 or pos.realized_pnl != 0:
                results.append(pos)

        return results

    def summary(self, refresh_prices: bool = True) -> PnLSummary:
        """查询整体持仓盈亏汇总。"""
        positions = self.holdings(refresh_prices=refresh_prices)
        all_trades = self._store.get_trades()

        total_cost = sum(p.total_cost for p in positions)
        total_mv = sum(p.market_value for p in positions)
        total_unrealized = sum(p.unrealized_pnl for p in positions)
        total_realized = sum(p.realized_pnl for p in positions)
        total_pnl = sum(p.total_pnl for p in positions)

        return PnLSummary(
            total_cost=round(total_cost, 2),
            total_market_value=round(total_mv, 2),
            total_unrealized_pnl=round(total_unrealized, 2),
            total_realized_pnl=round(total_realized, 2),
            total_pnl=round(total_pnl, 2),
            total_pnl_pct=round((total_pnl / total_cost * 100) if total_cost > 0 else 0, 2),
            holdings_count=len(positions),
            holdings=positions,
            trades_count=len(all_trades),
        )

    def stats(self) -> dict:
        """数据库统计。"""
        return self._store.get_stats()

    # ── 费率配置 ──────────────────────────────────────────────────

    def set_commission(self, rate: float = 0.00025, min_fee: float = 5.0) -> None:
        """设置全局默认佣金费率。

        Args:
            rate: 佣金费率，如 0.00025 = 万2.5
            min_fee: 最低佣金（元）
        """
        self._store.set_config_value("commission_rate", rate)
        self._store.set_config_value("commission_min", min_fee)

    def set_stamp_duty(self, rate: float = 0.0005) -> None:
        """设置印花税费率（仅卖出时收取）。"""
        self._store.set_config_value("stamp_duty_rate", rate)

    def set_transfer_fee(self, rate: float = 0.00001) -> None:
        """设置过户费费率。"""
        self._store.set_config_value("transfer_fee_rate", rate)

    def set_stock_commission(self, code: str, rate: float = None,
                             min_fee: float = None) -> None:
        """设置某只股票的专属佣金（覆盖全局默认）。

        Args:
            code: 股票代码
            rate: 佣金费率，None 表示沿用全局
            min_fee: 最低佣金，None 表示沿用全局
        """
        kwargs = {}
        if rate is not None:
            kwargs["commission_rate"] = rate
        if min_fee is not None:
            kwargs["commission_min"] = min_fee
        if kwargs:
            self._store.set_stock_config(code, **kwargs)

    def reset_stock_commission(self, code: str) -> None:
        """删除股票的专属佣金设置，恢复全局默认。"""
        self._store.delete_stock_config(code)

    def get_config(self) -> dict:
        """查看当前费率配置（含全局和各股票的专属设置）。"""
        return {
            "global": self._store.get_config(),
        }
