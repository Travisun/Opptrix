---
name: portfolio-review
description: 组合 / 关注列表复盘工作流（get_watchlist / get_portfolio_holdings / portfolio_summary / analyze_portfolio）。用户说「持仓」「组合」「复盘持仓」「关注列表怎么样」「组合诊断」「/portfolio-review」时使用。汇总事实后结构化输出；默认用 create_web 交付可预览 HTML；不做买卖/调仓建议。
license: Apache-2.0
metadata:
  author: opptrix
  version: "2.0"
  title: 组合复盘
  summary: 持仓与关注列表结构与风险摘要
  category: portfolio
  slash-rank: "90"
  default-deliverable: web
  required-packs: portfolio artifacts
allowed-tools: get_watchlist get_portfolio_holdings portfolio_summary analyze_portfolio create_web update_web read_web list_web_vendor create_canvas create_mindmap
---

# 组合 / 关注列表复盘

## 何时使用

用户要**复盘自己的关注列表或持仓组合**（集中度、摘要、风险结构），而不是单只个股深度报告。默认交付**可预览网页**。

## 分析架构（投研方法）

- **问题/假设**：组合暴露是否过度集中？盈亏结构由哪些持仓驱动？
- **证据清单**：关注列表、持仓明细、组合摘要、组合诊断结果
- **多维交叉验证**：市值/行业集中度 vs 个股贡献；摘要指标 vs 明细加总
- **结论与不确定**：结构事实优先；压力情景为推断且非操作建议
- **风险与缺口**：无持仓、价格刷新失败
- **事实与推断必须分开**：禁止「建议减仓/加仓」

## 数据维度

| 维度 | 取数方向 | 缺失时 |
|------|----------|--------|
| 关注列表 | `get_watchlist` | 说明为空 |
| 持仓明细 | `get_portfolio_holdings` | 仅做关注列表复盘 |
| 摘要 | `portfolio_summary` | 用明细自行汇总并说明 |
| 诊断 | `analyze_portfolio` | 省略诊断章 |
| 交付 | `list_web_vendor` → `create_web` | 用户只要口头要点时可跳过 |

## 步骤

1. **确认范围**：关注列表 / 持仓 / 两者。
2. **按维度取数**：列表与持仓 → 摘要 → 诊断。
3. **交叉验证与结构化结论**：集中度、贡献、风险结构；事实/推断分栏。
4. **交付网页（默认）**：`list_web_vendor` → `create_web`（可用本地 vendor 做权重饼图/条形图）；已有则 `read_web` / `update_web`。
5. **备选**：用户点名画布 / 结构图时改用对应工具。

## 网页报告建议目录

1. 复盘范围与时效  
2. 组合摘要 KPI  
3. 持仓/关注明细表  
4. 集中度与结构（行业/个股）  
5. 诊断要点（若有；推断标注）  
6. 风险与数据缺口  
7. 免责声明（无调仓建议）

## 禁止

- 荐股、调仓、目标仓位  
- 编造持仓或盈亏  
- **禁止无交付就结束**（默认须有 web 产物，除非用户明确只要口头要点）
