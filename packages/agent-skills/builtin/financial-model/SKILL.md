---
name: financial-model
description: 三表联动财务模型工作流。用户说「三表模型」「财务模型」「预测报表」「利润表资产负债表现金流联动」「勾稽」「/financial-model」时使用。partial；三表+勾稽+情景；不强制目标价。默认 create_web。含 income/balance/cash_flow 工具。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: 三表联动模型
  summary: 历史三表勾稽与情景预测框架
  category: valuation
  slash-rank: "135"
  default-deliverable: web
  required-packs: fundamentals workspace artifacts
allowed-tools: search_instruments get_instrument_profile get_instrument_financials get_instrument_income_statement get_instrument_balance_sheet get_instrument_cash_flow get_instrument_financial_indicators ask_user opptrix_run workspace_write workspace_read create_web update_web read_web list_web_vendor
---

# 三表联动模型

## 何时使用

用户要构建**历史三表整理 + 勾稽检查 + 情景预测**的财务模型，而非只要财报速读或只要 DCF 股权价值。边界：单期亮点用 `@skill:earnings-quick-read`；折现估值用 `@skill:dcf-model`。本技能 **不强制给出目标价**；完整度 **partial**。

## 分析架构（投研方法）

- **问题/假设**：历史三表是否勾稽？在何种经营假设下，预测期三表如何演化？
- **证据清单**：利润表、资产负债表、现金流量表、财务指标、用户增长/利润率假设
- **多维交叉验证**：净利润 vs 经营现金流；资产负债平衡；现金变动 vs 现金流合计
- **结论与不确定**：勾稽差为事实；预测路径为假设驱动；「可持续性」为推断
- **风险与缺口**：缺某一表、口径跨市场、预测年无用户假设
- **事实 | 假设 | 推断** 分栏强制

## 数据维度

| 维度 | 取数方向 | 缺失时 |
|------|----------|--------|
| 标的 | `search_instruments` / `ask_user` | 先确认 |
| 概况 | `get_instrument_profile` | 业务章从简 |
| 财务摘要 | `get_instrument_financials` | 仅用三表明细 |
| 利润表 | `get_instrument_income_statement` | 该表章标缺失 |
| 资产负债表 | `get_instrument_balance_sheet` | 无法做完整勾稽则降级 |
| 现金流 | `get_instrument_cash_flow` | 省略现金流联动说明原因 |
| 指标 | `get_instrument_financial_indicators` | 用原始科目推比率 |
| 预测假设 | `ask_user` | 仅交付历史模型，不编造预测 |
| 计算 | `opptrix_run` / `workspace_write` | 聊天内展示并说明 |
| 交付 | `list_web_vendor` → `create_web` | 用户只要口头要点时可跳过 |

## 步骤

1. **确认标的、币种与历史期数**。
2. **拉取三表与指标**；整理统一报告期。
3. **勾稽检查**：资产负债平衡、现金桥、利润与现金流关系；列出差异。
4. **情景（可选）**：用户给增长/费用率等假设后做基准/乐观/悲观；**不强制目标价**。
5. **固化**：关键表可 `workspace_write`；计算用 `opptrix_run`。
6. **交付网页（默认）**：`list_web_vendor` → `create_web`；已有则 `read_web` / `update_web`。
7. 标注 **partial**：缺表或无法勾稽时诚实降级。

## 网页报告建议目录

1. 标的、报告期与时效  
2. 历史三表摘要  
3. 勾稽检查结果（差异清单）  
4. 关键比率与趋势（事实）  
5. 情景假设表（若有）  
6. 预测期三表摘要（假设驱动）  
7. 事实 | 假设 | 推断分栏结论  
8. 风险、缺口与免责声明（无买卖建议；无强制目标价）

## 禁止

- 荐股；编造缺失科目或强制给出目标价  
- **禁止无交付就结束**（默认须有 web 产物，除非用户明确只要口头要点）  
- 勾稽失败却声称「模型已平衡」  
- assumption / not-feasible 须诚实降级  
- 禁止用预测表冒充已披露财报
