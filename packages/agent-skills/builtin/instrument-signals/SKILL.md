---
name: instrument-signals
description: 标的信号 / 指标分析工作流（工具 evaluate_instrument / get_instrument_strategy_signal / get_instrument_indicators / get_instrument_chart）。用户说「技术指标」「策略信号」「评估一下」「看指标」「evaluate_instrument」「/instrument-signals」时使用。拉取评估与指标后结构化解读，不做买卖建议。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  required-packs: instrument_analytics
allowed-tools: evaluate_instrument get_instrument_strategy_signal get_instrument_indicators get_instrument_chart
---

# 标的信号 / 指标分析

## 何时使用

用户要对某标的看**技术指标、策略信号或量化评估结果**，而不是完整基本面尽调或 ETF 持仓研究。

## 步骤

1. **确认标的**：搜索定位 `instrument`；多候选时请用户选择。
2. **评估与信号**：激活后直接调 `evaluate_instrument`、`get_instrument_strategy_signal`（按需）。
3. **指标与图**：`get_instrument_indicators`、`get_instrument_chart` 补充定量上下文。
4. **结构化输出**：关键指标/信号摘要 → 含义（推断须标注）→ 局限与数据缺口。
5. **输出边界**：**不给出**买卖建议、目标价或仓位建议；信号≠荐股。

## 禁止

- 把信号说成「建议买入/卖出」
- 编造未返回的指标值
- 用本技能替代完整尽调（应转 `` `@skill:equity-deep-dive` ``）
