"""
持仓数据模型 — 交易记录、持仓、盈亏结果
"""

from __future__ import annotations

from dataclasses import dataclass, field, asdict
from datetime import datetime
from enum import Enum
from typing import Optional


class TradeSide(str, Enum):
    BUY = "buy"
    SELL = "sell"


@dataclass
class TradeRecord:
    """一条交易记录"""
    code: str                               # 股票代码
    trade_side: str = ""                    # "buy" / "sell"
    shares: float = 0.0                     # 股数
    price: float = 0.0                      # 成交单价
    amount: float = 0.0                     # 成交金额
    id: int = 0
    name: str = ""                          # 股票名称
    commission: float = 0.0                 # 佣金
    stamp_duty: float = 0.0                 # 印花税
    transfer_fee: float = 0.0               # 过户费
    total_fee: float = 0.0                  # 总费用
    trade_date: str = ""                    # 交易日期
    created_at: str = ""

    def to_dict(self):
        return {k: v for k, v in asdict(self).items() if v is not None}


@dataclass
class HoldingPosition:
    """一只股票的持仓"""
    code: str                               # 股票代码
    shares: float = 0.0                     # 持有股数
    cost_basis: float = 0.0                 # 持仓成本（每股均价）
    total_cost: float = 0.0                 # 持仓总成本
    name: str = ""
    current_price: float = 0.0
    market_value: float = 0.0
    unrealized_pnl: float = 0.0
    unrealized_pnl_pct: float = 0.0
    realized_pnl: float = 0.0
    total_pnl: float = 0.0
    total_pnl_pct: float = 0.0

    def to_dict(self):
        return {k: v for k, v in asdict(self).items() if v is not None}


@dataclass
class PnLSummary:
    """整体盈亏汇总"""
    total_cost: float = 0.0
    total_market_value: float = 0.0
    total_unrealized_pnl: float = 0.0
    total_realized_pnl: float = 0.0
    total_pnl: float = 0.0
    total_pnl_pct: float = 0.0
    holdings_count: int = 0
    trades_count: int = 0
    holdings: list = field(default_factory=list)

    def to_dict(self):
        return {k: v for k, v in asdict(self).items() if v is not None}
