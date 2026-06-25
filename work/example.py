"""
stock_eval 使用示例 — 个股评估 + 评分 + 筛选

前置条件:
  pip install -e /path/to/a-stock-layer

快速上手:
  python3 work/example.py
"""

import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "stock_eval"))
sys.path.insert(0, os.path.dirname(__file__))


def demo_single_stock():
    """演示1: 单只股票全因子评估 + 多评分卡评分"""
    print("=" * 60)
    print("【演示1】单只股票全因子评估 + 评分")
    print("=" * 60)

    from a_stock_layer import AshareEngine
    from stock_eval import EvaluationEngine
    from stock_eval.scoring.scorecard import create_scorecard, list_templates

    de = AshareEngine()
    ee = EvaluationEngine(de)

    code = "600519"
    print(f"\n分析: {code} ...\n")

    snapshot = ee.analyze(code)

    # 展示有效因子
    valid = [(n, fr) for n, fr in snapshot.factors.items()
             if fr is not None and fr.value is not None]
    valid.sort(key=lambda x: x[1].meta.category.value)

    print(f"股票: {snapshot.name} ({snapshot.code})")
    print(f"有效因子: {len(valid)} / {len(snapshot.factors)}\n")

    current_cat = None
    for name, fr in valid:
        cat = fr.meta.category.value
        if cat != current_cat:
            print(f"  [{cat}]")
            current_cat = cat
        arrow = "↑" if fr.meta.higher_is_better else "↓"
        unit = f" {fr.meta.unit}" if fr.meta.unit else ""
        print(f"    {name:25s} = {fr.value:>10.2f}{unit}  {arrow}")

    # 评分
    print("\n  评分结果:")
    for tmpl_name in list_templates():
        card = create_scorecard(tmpl_name)
        card.score([snapshot])
        print(f"    {tmpl_name:12s}: {snapshot.total_score:5.1f} 分")

    print()
    return snapshot


def demo_screening():
    """演示2: 多条件筛选 + 评分排名"""
    print("=" * 60)
    print("【演示2】多条件筛选引擎")
    print("=" * 60)

    from a_stock_layer import AshareEngine
    from stock_eval import EvaluationEngine
    from stock_eval.screening import Screener, Condition

    de = AshareEngine()
    ee = EvaluationEngine(de)
    screener = Screener(ee)

    # 筛选条件: ROE > 15% 且 负债率 < 50%
    conditions = [
        Condition("roe", ">", 15),
        Condition("debt_ratio", "<", 50),
        Condition("dividend_yield", ">", 1),
    ]

    print("\n筛选条件:")
    for c in conditions:
        print(f"  {c}")

    # 先在小范围测试（5只白马股）
    test_codes = ["600519", "000858", "000333", "600036", "601318"]

    print(f"\n在 {len(test_codes)} 只候选股中筛选...\n")

    result = screener.run(
        conditions=conditions,
        universe=test_codes,
        scorecard_name="综合评估",
        top_n=5,
    )

    print(result.summary())
    print()

    return result


def demo_custom_factor():
    """演示3: 注册自定义因子"""
    print("=" * 60)
    print("【演示3】自定义因子注册")
    print("=" * 60)

    from stock_eval.core.models import FactorMeta, FactorResult, FactorCategory
    from stock_eval.core.registry import REGISTRY, register_factor
    from stock_eval.factors.base import BaseFactor

    @register_factor
    class MyFactor(BaseFactor):
        """自定义因子示例 — 市销率倒数"""
        meta = FactorMeta(
            name="ps_inverse",
            category=FactorCategory.VALUATION,
            description="市销率倒数 = 营收 / 市值，越高越好",
            unit="%",
            higher_is_better=True,
            requires_financials=True,
            requires_realtime=True,
        )

        def compute(self, code: str):
            # 演示: 这里只是骨架，实际实现需要调用 data engine
            return FactorResult(
                name="ps_inverse", value=42.0, meta=self.meta,
                details={"note": "自定义因子示例"}
            )

    print(f"\n自定义因子 [ps_inverse] 已注册")
    print(f"注册表总计: {REGISTRY.count} 个因子")
    print(f"估值类因子: {REGISTRY.list(FactorCategory.VALUATION)}\n")

    REGISTRY._factors.pop("ps_inverse", None)
    REGISTRY._metas.pop("ps_inverse", None)


def main():
    print("\n" + " " * 20 + "stock_eval 演示\n")

    # 展示系统结构
    from stock_eval.core.registry import REGISTRY
    from stock_eval.core.models import FactorCategory

    print("=" * 60)
    print("系统概览")
    print("=" * 60)
    print(REGISTRY.summary())
    print()
    print("可用评分卡模板:")
    from stock_eval.scoring.scorecard import list_templates
    for t in list_templates():
        print(f"  - {t}")
    print()

    demo_single_stock()
    demo_custom_factor()


if __name__ == "__main__":
    main()
