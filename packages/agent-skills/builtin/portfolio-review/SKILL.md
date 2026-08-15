---
name: portfolio-review
description: 组合 / 关注列表复盘工作流（工具 get_watchlist / get_portfolio_holdings / portfolio_summary / analyze_portfolio）。用户说「持仓」「组合」「复盘持仓」「关注列表怎么样」「组合诊断」「analyze_portfolio」「/portfolio-review」时使用。汇总持仓与关注列表事实后结构化输出，不做买卖建议。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  required-packs: portfolio
allowed-tools: get_watchlist get_portfolio_holdings portfolio_summary analyze_portfolio
---

# 组合 / 关注列表复盘

## 何时使用

用户要**复盘自己的关注列表或持仓组合**（集中度、摘要、风险结构），而不是单只个股深度报告。

## 步骤

1. **拉取列表**：`get_watchlist` 与/或 `get_portfolio_holdings`（按用户所指）。
2. **摘要与分析**：`portfolio_summary`、`analyze_portfolio`；无持仓时说明并引导补充，勿编造。
3. **结构化输出**：构成概览 → 集中度/风格要点 → 风险与数据缺口。
4. **输出边界**：**不给出**调仓、买卖或目标仓位建议。

## 禁止

- 荐股、暗示「该加仓/减仓某标的」
- 编造未返回的持仓权重或盈亏
