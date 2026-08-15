---
name: earnings-quick-read
description: 财报速读工作流。用户说「财报」「季报」「年报」「业绩快报」「读一下财报」「营收利润同比」时使用。提取关键财务并解读变化与风险；默认用 create_web 交付可预览 HTML 财报速读页。
license: Apache-2.0
metadata:
  author: opptrix
  version: "2.0"
  title: 财报速读
  summary: 报告期关键财务与变化一目了然
  category: equity
  slash-rank: "50"
  default-deliverable: web
  required-packs: fundamentals artifacts
allowed-tools: get_instrument_profile get_instrument_financials get_instrument_income_statement get_instrument_balance_sheet get_instrument_cash_flow get_instrument_financial_indicators create_web update_web read_web list_web_vendor create_canvas create_mindmap
---

# 财报速读

## 何时使用

用户要对某标的的**财报/业绩**做快速解读（不是全市场简报，也不是完整尽调）。默认交付**可预览网页**。

## 分析架构（投研方法）

- **问题/假设**：本报告期增长是否由主业驱动？盈利质量（现金流 vs 利润）是否匹配？
- **证据清单**：财务摘要、三表关键行、财务指标、（按需）概况中的主营描述
- **多维交叉验证**：营收 vs 净利润增速；利润 vs 经营现金流；资产负债结构 vs 费用扩张
- **结论与不确定**：亮点与恶化项分列；归因标为推断
- **风险与缺口**：无该期数据、科目口径跨市场差异
- **事实与推断必须分开**：报表数字为事实；「需求回暖导致…」为推断

## 数据维度

| 维度 | 取数方向 | 缺失时 |
|------|----------|--------|
| 标的与报告期 | 用户确认 / `ask_user` | 不清则先确认再取数 |
| 财务摘要 | `get_instrument_financials` | 「暂无该期财报数据」 |
| 利润表 | `get_instrument_income_statement` | 仅用摘要可用字段 |
| 资产负债表 | `get_instrument_balance_sheet` | 省略资产负债章 |
| 现金流 | `get_instrument_cash_flow` | 省略现金流章 |
| 指标 | `get_instrument_financial_indicators` | 用摘要同比即可 |
| 业务背景 | `get_instrument_profile` | 不做强行归因 |
| 交付 | `list_web_vendor` → `create_web` | 用户只要口头要点时可跳过 |

## 步骤

1. **确认标的与报告期**。
2. **按维度取数**：摘要优先，再按需三表与指标。
3. **交叉验证与结构化结论**：核心指标表 → 亮点/恶化 → 风险与缺口。
4. **交付网页（默认）**：`list_web_vendor` → `create_web`；已有则 `read_web` / `update_web`。
5. **备选**：用户点名画布 / 结构图时改用对应工具。

## 网页报告建议目录

1. 标的与报告期、数据时效  
2. 核心指标表（营收、净利、毛利/净利率、经营现金流等可用项）  
3. 同比/环比亮点与恶化项  
4. 变化归因（推断标注）  
5. 风险与数据缺口  
6. 免责声明（无买卖结论）

## 禁止

- 荐股；无数据时编造科目  
- **禁止无交付就结束**（默认须有 web 产物，除非用户明确只要口头要点）  
- 美股/港股字段不同时，按实际返回写，勿套错科目名
