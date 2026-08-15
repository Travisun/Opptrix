---
name: shareholder-structure
description: 股东结构分析。用户说「股东结构」「十大股东」「机构持股」「筹码结构」「/shareholder-structure」时使用。A 股全量路径优先（full CN）；工具含 get_instrument_shareholders get_institution_holdings。默认 create_web。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: 股东结构
  summary: 十大股东与机构持仓结构解读
  category: equity
  slash-rank: "185"
  default-deliverable: web
  required-packs: fundamentals artifacts
allowed-tools: search_instruments get_instrument_profile get_instrument_shareholders get_institution_holdings ask_user create_web update_web read_web list_web_vendor
---

# 股东结构

## 何时使用

用户要分析标的的 **股东名册、十大股东、机构持仓结构与变化**，而非完整尽调或公告条款精读。边界：公告全文用 `@skill:announcement-deepread`；资金流短线用尽调中的资金维度。本技能对 **A 股（CN）按 full 路径** 取股东与机构数据；其他市场按实际返回诚实降级。

## 分析架构（投研方法）

- **问题/假设**：股权是否集中？机构进出如何变化？是否存在显著质押/受限线索（若数据返回）？
- **证据清单**：股东列表、机构持仓、公司概况
- **多维交叉验证**：前十大合计 vs 流通盘；机构持仓变动方向 vs 叙事（推断须标注）
- **结论与不确定**：名册数字为事实；「看好/看空信号」为推断且弱
- **风险与缺口**：非 CN 字段缺失、报告期滞后、机构口径不一
- **事实 | 假设 | 推断** 分栏强制

## 数据维度

| 维度 | 取数方向 | 缺失时 |
|------|----------|--------|
| 标的 | `search_instruments` / `ask_user` | 先确认 |
| 概况 | `get_instrument_profile` | 跳过股本背景 |
| 股东名册 | `get_instrument_shareholders` | 标明暂无股东数据 |
| 机构持仓 | `get_institution_holdings` | 省略机构章 |
| 交付 | `list_web_vendor` → `create_web` | 用户只要口头要点时可跳过 |

## 步骤

1. **确认标的与市场**（CN 走 full；其他市场预期可能 partial）。
2. **取数**：`get_instrument_shareholders` + `get_institution_holdings` + 概况。
3. **结构化**：集中度、前十大、机构进出、报告期时效。
4. **事实 | 假设 | 推断** 分栏；不做「庄股」臆测。
5. **交付网页（默认）**：`list_web_vendor` → `create_web`；已有则 `read_web` / `update_web`。

## 网页报告建议目录

1. 标的、报告期与时效  
2. 股本与股东总览（若有）  
3. 十大股东表  
4. 机构持仓与变动  
5. 集中度与结构要点（事实）  
6. 事实 | 假设 | 推断分栏  
7. 风险与数据缺口（含非 CN 降级说明）  
8. 免责声明（无买卖建议）

## 禁止

- 荐股；编造股东名单或机构持仓  
- **禁止无交付就结束**（默认须有 web 产物，除非用户明确只要口头要点）  
- 把滞后名册写成「今日筹码」  
- assumption / not-feasible 须诚实降级  
- 禁止无证据指控操纵或内幕
