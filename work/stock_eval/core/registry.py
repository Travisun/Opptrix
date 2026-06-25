"""
因子注册表 — 插件式架构核心

设计原则：
  - 新增因子只需写一个 Factor 子类 + metadata，自动注册
  - 删除/禁用因子不影响其他因子
  - 注册表可序列化，用于调试/审计
"""

from __future__ import annotations
from typing import Optional, List

from .models import FactorMeta, FactorCategory


class _FactorRegistry:
    """单例注册表"""

    def __init__(self):
        self._factors: dict[str, type] = {}
        self._metas: dict[str, FactorMeta] = {}

    def register(self, factor_cls: type) -> type:
        meta = getattr(factor_cls, "meta", None)
        if meta is None:
            raise ValueError(
                f"{factor_cls.__name__} 缺少 meta 属性，"
                "请设置 FactorMeta"
            )
        if not isinstance(meta, FactorMeta):
            raise TypeError(f"{factor_cls.__name__}.meta 必须是 FactorMeta")

        name = meta.name
        if name in self._factors:
            import warnings
            warnings.warn(f"因子 [{name}] 被重复注册，覆盖旧实现")

        self._factors[name] = factor_cls
        self._metas[name] = meta
        return factor_cls

    def get(self, name: str) -> Optional[type]:
        return self._factors.get(name)

    def get_meta(self, name: str) -> Optional[FactorMeta]:
        return self._metas.get(name)

    def list(self, category: Optional[FactorCategory] = None) -> List[str]:
        if category is None:
            return list(self._factors.keys())
        return [
            n for n, m in self._metas.items()
            if m.category == category
        ]

    def list_metas(self, category: Optional[FactorCategory] = None
                   ) -> List[FactorMeta]:
        if category is None:
            return list(self._metas.values())
        return [m for m in self._metas.values() if m.category == category]

    @property
    def count(self) -> int:
        return len(self._factors)

    def summary(self) -> str:
        lines = [f"因子注册表 -- 共 {self.count} 个因子\n"]
        for cat in FactorCategory:
            names = self.list(cat)
            if names:
                lines.append(f"  [{cat.value}] {', '.join(sorted(names))}")
        return "\n".join(lines)


REGISTRY = _FactorRegistry()


def register_factor(cls=None, *, name: Optional[str] = None):
    import functools

    def _wrapper(klass):
        if name is not None:
            if hasattr(klass, "meta") and klass.meta is not None:
                klass.meta = FactorMeta(
                    name=name,
                    category=klass.meta.category,
                    description=klass.meta.description,
                )
        REGISTRY.register(klass)
        return klass

    if cls is None:
        return _wrapper
    return _wrapper(cls)
