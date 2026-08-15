---
name: etf-research
description: ETF 研究工作流（工具 get_etf_list / get_etf_nav / get_etf_holdings / get_etf_profile）。用户说「ETF」「场内基金」「看一下 ETF」「净值」「持仓」「ETF 对比」「get_etf_list」「/etf-research」时使用。按列表→概况→净值→持仓收集证据后结构化输出，不做买卖建议。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  required-packs: etf
allowed-tools: get_etf_list get_etf_nav get_etf_holdings get_etf_profile
---

# ETF 研究

## 何时使用

用户要了解 **ETF/场内基金** 的概况、净值走势或持仓结构，而不是个股尽调或全市场早报。

## 步骤

1. **定位标的**：用 `get_etf_list` / 搜索确认代码；多候选时请用户选择。
2. **概况**：`get_etf_profile` 取跟踪指数、规模、费用等可得字段。
3. **净值与持仓（按需）**：`get_etf_nav`、`get_etf_holdings`；缺失处写明缺口。
4. **结构化输出**：概况 → 净值要点 → 持仓/行业分布（若有）→ 风险与数据局限。
5. **输出边界**：**不给出**买卖建议、目标价或仓位建议。

## 禁止

- 荐股或编造持仓/净值
- 把个股深度分析流程硬套到 ETF（应转 `` `@skill:equity-deep-dive` `` 仅当用户明确要个股）
