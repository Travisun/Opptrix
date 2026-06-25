"""
Driver 注册中心 — 结构化数据驱动，支持热插拔。
"""

from __future__ import annotations

import importlib
import inspect
import logging
from typing import Dict, List, Optional, Type

from .schema import Capability

logger = logging.getLogger("a_stock_layer.registry")


class DriverRegistry:
    """Driver 注册中心，管理所有数据源驱动器的优先级和热插拔。

    特性:
    - 按优先级排序（高优先级的 driver 优先被 engine 调用）
    - 按能力索引，快速查找某个数据维度的可用 driver 列表
    - 支持运行时注册/注销（热插拔）
    """

    def __init__(self):
        self._drivers: Dict[str, "BaseDriver"] = {}       # name -> driver instance
        self._capability_index: Dict[Capability, List[str]] = {}  # capability -> [driver_names]

    # ── 注册 ──────────────────────────────────────────────────────────

    def register(self, driver: "BaseDriver") -> None:
        """注册一个 driver 实例。重名会覆盖（并给出警告）。"""
        name = driver.name()
        if name in self._drivers:
            logger.warning("Driver [%s] 已存在，将被覆盖", name)

        self._drivers[name] = driver
        for cap in driver.capabilities():
            self._capability_index.setdefault(cap, []).append(name)
            # 按优先级降序排列（高优先级在前）
            self._capability_index[cap].sort(
                key=lambda n: self._drivers[n].priority(), reverse=True
            )
        logger.info("Driver [%s] 已注册，优先级=%s，能力=%s",
                     name, driver.priority(),
                     [c.value for c in driver.capabilities()])

    def unregister(self, name: str) -> None:
        """注销一个 driver。"""
        if name not in self._drivers:
            return
        driver = self._drivers.pop(name)
        for cap in driver.capabilities():
            if cap in self._capability_index:
                self._capability_index[cap] = [
                    n for n in self._capability_index[cap] if n != name
                ]
                if not self._capability_index[cap]:
                    del self._capability_index[cap]
        logger.info("Driver [%s] 已注销", name)

    def get(self, name: str) -> Optional["BaseDriver"]:
        return self._drivers.get(name)

    def list_drivers(self) -> List[str]:
        return list(self._drivers.keys())

    # ── 按能力查询 ────────────────────────────────────────────────────

    def get_drivers_for_capability(self, cap: Capability) -> List["BaseDriver"]:
        """返回支持某能力的所有 driver，按优先级降序。"""
        names = self._capability_index.get(cap, [])
        return [self._drivers[n] for n in names if n in self._drivers]

    def get_primary_driver(self, cap: Capability) -> Optional["BaseDriver"]:
        """返回某能力优先级最高的 driver。"""
        drivers = self.get_drivers_for_capability(cap)
        return drivers[0] if drivers else None

    # ── 批量注册 ──────────────────────────────────────────────────────

    def discover_and_register_all(self) -> int:
        """自动发现并注册所有内置 driver。返回注册数量。"""
        from a_stock_layer.drivers.base import BaseDriver

        count = 0
        # 已知的 driver 模块列表（按优先级顺序）
        driver_modules = [
            "a_stock_layer.drivers.eastmoney",
            "a_stock_layer.drivers.mootdx_driver",
            "a_stock_layer.drivers.efinance_driver",
            "a_stock_layer.drivers.tencent",
            "a_stock_layer.drivers.sina",
            "a_stock_layer.drivers.tonghuashun",
            "a_stock_layer.drivers.netease",
            "a_stock_layer.drivers.xueqiu",
            "a_stock_layer.drivers.pytdx_driver",
            "a_stock_layer.drivers.cninfo",
            "a_stock_layer.drivers.guba",
            "a_stock_layer.drivers.stats_gov",
            "a_stock_layer.drivers.csindex",
        ]

        for mod_path in driver_modules:
            try:
                mod = importlib.import_module(mod_path)
                # 找到模块中所有 BaseDriver 子类（非 BaseDriver 自身）
                for _, cls in inspect.getmembers(mod, inspect.isclass):
                    if issubclass(cls, BaseDriver) and cls is not BaseDriver:
                        instance = cls()
                        self.register(instance)
                        count += 1
            except Exception as e:
                logger.warning("加载 driver [%s] 失败: %s", mod_path, e)

        return count

    def register_driver_class(self, driver_cls: Type["BaseDriver"]) -> None:
        """注册一个 driver 类（热插拔用）。"""
        instance = driver_cls()
        self.register(instance)
