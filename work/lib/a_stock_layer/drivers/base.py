"""
BaseDriver — 所有数据源驱动器的抽象基类。

每个 driver 需要:
1. 定义 name() 和 priority()
2. 声明 capabilities()
3. 实现对应的方法

优先级: 数字越大越优先被尝试。
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import List, Optional

from a_stock_layer.core.schema import (
    Capability, IndexKline, IndexRealtime, MarketMoneyFlow,
    MoneyFlow, SectorMoneyFlow, StockKline, StockRealtime,
)


class BaseDriver(ABC):

    @abstractmethod
    def name(self) -> str:
        """Driver 唯一标识名。"""
        ...

    @abstractmethod
    def priority(self) -> int:
        """优先级（越大越优先）。"""
        ...

    @abstractmethod
    def capabilities(self) -> List[Capability]:
        """声明支持的查询能力。"""
        ...

    # ── 可选实现的方法 ────────────────────────────────────────────────
    # 不支持的返回 None（引擎会跳过）

    def realtime(self, code: str) -> Optional[List[StockRealtime]]:
        return None

    def batch_realtime(self, codes: List[str]) -> Optional[List[StockRealtime]]:
        return None

    def kline(self, code: str, period: str = "daily",
              start: str = "", end: str = "") -> Optional[List[StockKline]]:
        return None

    def money_flow(self, code: str) -> Optional[List[MoneyFlow]]:
        return None

    def index_realtime(self, code: str) -> Optional[List[IndexRealtime]]:
        return None

    def index_kline(self, code: str, period: str = "daily",
                    start: str = "", end: str = "") -> Optional[List[IndexKline]]:
        return None

    def market_money_flow(self, direction: str = "north") -> Optional[List[MarketMoneyFlow]]:
        return None

    def sector_money_flow(self, sector_type: str = "industry") -> Optional[List[SectorMoneyFlow]]:
        return None

    # ── 工具方法 ──────────────────────────────────────────────────────

    def _norm_code(self, code: str) -> str:
        """统一返回6位股票代码。"""
        return code.strip().zfill(6)

    def _is_sh(self, code: str) -> bool:
        """判断是否上交所。"""
        c = code.strip().zfill(6)
        return c.startswith(("6", "68", "9"))

    def _is_sz(self, code: str) -> bool:
        """判断是否深交所。"""
        c = code.strip().zfill(6)
        return not c.startswith(("6", "68", "9"))

    def _sec_full_code(self, code: str) -> str:
        """返回带前缀的完整代码（含指数特殊处理）。"""
        from a_stock_layer.utils.helpers import resolve_full_code
        return resolve_full_code(code)

    # ── 产业链挖掘方法（可选实现） ────────────────────────────────────

    def main_business(self, code: str) -> Optional[List["MainBusinessData"]]:
        return None

    def top_customer_supplier(self, code: str, direction: str = "customer") -> Optional[List["TopCustomerSupplier"]]:
        return None

    def actual_controller(self, code: str) -> Optional[List["ActualController"]]:
        return None

    def subsidiaries(self, code: str) -> Optional[List["SubsidiaryData"]]:
        return None

    def related_party_trades(self, code: str) -> Optional[List["RelatedPartyTrade"]]:
        return None

    def rd_investment(self, code: str) -> Optional[List["RDInvestment"]]:
        return None

    def ma_events(self, code: str) -> Optional[List["MAEvent"]]:
        return None

    def employee_composition(self, code: str) -> Optional[List["EmployeeComposition"]]:
        return None

    def institutional_visits(self, code: str) -> Optional[List["InstitutionalVisit"]]:
        return None

    def peer_companies(self, code: str) -> Optional[List["PeerCompany"]]:
        return None
