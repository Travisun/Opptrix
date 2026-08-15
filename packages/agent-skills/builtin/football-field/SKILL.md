---
name: football-field
description: 估值球场图 / 多方法估值区间汇总。用户说「估值球场」「football field」「估值区间对比」「多种估值方法并排」「/football-field」时使用。assumption-only；可链 comps/dcf 区间；先例库无则省略该条。默认 create_web 交付。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: 估值球场图
  summary: 多方法估值区间并排对照
  category: valuation
  slash-rank: "130"
  default-deliverable: web
  required-packs: fundamentals industry artifacts
allowed-tools: search_instruments get_instrument_profile get_instrument_financials get_instrument_snapshot ask_user workspace_read create_web update_web read_web list_web_vendor
---

# 估值球场图（Football Field）

## 何时使用

用户要**并排对比多种估值方法给出的价值区间**（同业倍数、DCF、资产法、用户给定先例等），形成一页「球场图」总览。边界：详细 Trading Comps 样本表用 `@skill:comps-analysis`；完整折现模型用 `@skill:dcf-model`。本技能是 **区间汇总页**，完整度 **assumption-only**。

## 分析架构（投研方法）

- **问题/假设**：各方法在何种假设下给出高低值？重叠区间说明什么？
- **证据清单**：现价与股本（事实）、已有 comps/dcf 输出或会话内重算、用户先例区间（假设）
- **多维交叉验证**：方法间重叠带 vs 现价位置；终端价值/倍数极端时区间是否失真
- **结论与不确定**：重叠带为模型输出汇总；「应交易于此」为推断
- **风险与缺口**：无先例库、无 DCF 假设、同业样本过少
- **事实 | 假设 | 推断** 分栏：现价为事实；各方法输入为假设；区间含义为推断

## 数据维度

| 维度 | 取数方向 | 缺失时 |
|------|----------|--------|
| 标的与现价 | `search_instruments` / `get_instrument_snapshot` | 标明无现价对照 |
| 概况/股本线索 | `get_instrument_profile` / `get_instrument_financials` | 仅展示每股/股权价值之一 |
| Comps 区间 | 会话内 comps 结果或简要重算 | 省略该条方法，不编造 |
| DCF 区间 | 会话内 dcf 或 `ask_user` 假设后粗算 | 省略该条 |
| 先例交易 | 用户提供 / workspace 既有笔记 | **先例库无则省略该条** |
| 既有笔记 | `workspace_read` | 不虚构历史估值 |
| 交付 | `list_web_vendor` → `create_web` | 用户只要口头要点时可跳过 |

## 步骤

1. **确认标的与要纳入的方法清单**（至少两种，否则建议改走单一技能）。
2. **收集各方法高低值**：优先复用本会话 comps/dcf；缺则 `ask_user` 或简要重算并标假设。
3. **先例**：仅当用户或 workspace 有依据时纳入；**无先例库则省略，禁止编造。**
4. **绘制球场**：各方法一条水平区间 + 现价竖线；标注假设来源。
5. **交付网页（默认）**：`list_web_vendor` → `create_web`（本地 vendor 条形/区间图）；已有则 `read_web` / `update_web`。
6. **标注 assumption-only**；不可行方法写 not-feasible 并从图中移除。

## 网页报告建议目录

1. 标的、现价与时效  
2. 方法清单与假设来源表  
3. 估值球场图（多方法区间）  
4. 重叠带与现价位置（事实汇总 + 推断分栏）  
5. 各方法附录：关键输入一览  
6. 省略方法说明（如无先例）  
7. 风险与缺口  
8. 免责声明（无买卖建议）

## 禁止

- 荐股；编造先例倍数或未计算的 DCF 区间  
- **禁止无交付就结束**（默认须有 web 产物，除非用户明确只要口头要点）  
- 先例库不存在时仍画「先例」条  
- assumption / not-feasible 须诚实降级  
- 禁止用单一点估计冒充多方法共识
