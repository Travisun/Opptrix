"""
评估引擎 — 对单只或多只股票执行因子计算
"""

from __future__ import annotations
from typing import Optional, List, Callable
from concurrent.futures import ThreadPoolExecutor, as_completed

from .models import FactorResult, StockSnapshot
from .registry import REGISTRY


class EvaluationEngine:
    """
    评估引擎

    参数:
      data_engine: a_stock_layer.AshareEngine 实例
      max_workers: 批量拉取数据时的并行数
    """

    def __init__(self, data_engine, max_workers: int = 8):
        self._de = data_engine
        self._max_workers = max_workers

    def analyze(self, code: str,
                factor_names: Optional[List[str]] = None,
                with_name: bool = True) -> StockSnapshot:
        """对单只股票执行因子计算"""
        name = code
        if with_name:
            try:
                r = self._de.realtime(code)
                if r.success and r.data:
                    name = r.data[0].name
            except Exception:
                pass

        snapshot = StockSnapshot(code=code, name=name)
        names = factor_names or REGISTRY.list()

        for fname in names:
            cls = REGISTRY.get(fname)
            if cls is None:
                continue
            try:
                instance = cls(self._de)
                result = instance.compute(code)
                if result is not None:
                    snapshot.factors[fname] = result
            except Exception as exc:
                meta = REGISTRY.get_meta(fname)
                snapshot.factors[fname] = FactorResult(
                    name=fname, value=None,
                    meta=meta, details={"error": str(exc)}
                )

        return snapshot

    def analyze_batch(self, codes: List[str],
                      factor_names: Optional[List[str]] = None,
                      with_name: bool = True,
                      progress_callback: Optional[Callable] = None
                      ) -> dict[str, StockSnapshot]:
        """批量分析多只股票"""
        results = {}

        with ThreadPoolExecutor(max_workers=self._max_workers) as pool:
            futures = {
                pool.submit(self.analyze, code, factor_names, with_name): code
                for code in codes
            }
            for i, future in enumerate(as_completed(futures), 1):
                code = futures[future]
                try:
                    results[code] = future.result()
                except Exception as exc:
                    results[code] = StockSnapshot(
                        code=code, name=code,
                        factors={"_error": FactorResult(
                            name="_error", value=None, meta=None,
                            details={"error": str(exc)}
                        )}
                    )
                if progress_callback:
                    progress_callback(i, len(codes), code)

        return results

    @property
    def data_engine(self):
        return self._de
