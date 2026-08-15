---
name: strategy-report
description: 策略报告工作流（工具 strategy_report）。用户说「策略报告」「策略总结」「策略表现报告」「出一份策略报告」「strategy_report」「/strategy-report」时使用。激活后直接调用 strategy_report，结构化呈现策略表现，不做买卖建议。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  required-packs: strategy_extra
allowed-tools: strategy_report
---

# 策略报告

## 何时使用

用户要一份**策略表现/规则说明类报告**（相对单次回测数字，更偏结构化叙述与汇总）。

## 步骤

1. **确认范围**：策略标识、区间、对比基准（若有）；不清时简短确认。
2. **生成报告**：激活后直接调 `strategy_report`。
3. **结构化输出**：摘要 → 关键指标 → 风险与局限 → 数据缺口；事实与推断分开。
4. **输出边界**：**不给出**买卖建议、目标价或仓位建议。

## 禁止

- 荐股或编造未返回的数据
- 把「随便说说策略好不好」当成已跑通的报告结果
