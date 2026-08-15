---
name: lean-indicator-playbook
description: LEAN 启发的技术指标手册工作流。用户说「LEAN 指标」「指标手册」「indicator playbook」「均线/RSI/MACD 怎么用」「/lean-indicator-playbook」时使用。方法溯源 QuantConnect LEAN 指标库用法，用平台行情/指标工具做教育式解读；默认 A股适配。默认 create_web。禁止假装跑完整 LEAN 引擎。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: LEAN指标手册
  summary: A股可用指标定义、参数与用法对照
  category: quant
  slash-rank: "400"
  default-deliverable: web
  required-packs: instrument_analytics artifacts
allowed-tools: search_instruments get_instrument_snapshot get_instrument_indicators get_instrument_chart ask_user opptrix_run workspace_write workspace_read create_web update_web read_web list_web_vendor
---

# LEAN 指标手册

方法溯源 **QuantConnect LEAN** 指标与算法示例中的常见技术指标用法；本技能是**教育/对照式手册 + 平台数据解读**，**禁止假装跑完整 LEAN 引擎**或输出 LEAN 回测曲线冒充引擎结果。

## 何时使用

用户要理解 **A股可用**的一类或多类技术指标定义、典型参数、信号逻辑与局限（手册向；LEAN 方法溯源，非美股原版照搬）。

边界：单标的评估/策略信号用 `@skill:instrument-signals`；均线交叉趋势实操用 `@skill:lean-ma-cross-trend`；RSI 回归实操用 `@skill:lean-rsi-reversion`。默认交付可预览网页。

## A股适配（默认）

- 默认市场 **CN（A股 / 场内 ETF）**。用户点名美股/港股再切换，并声明数据口径与微观结构差异。
- 默认 CN 标的解读指标手册；涨跌停导致部分指标钝化须在对应指标条注明。
- 美股原版指标参数仅作对照。
- 不可硬适配或数据缺口时：首页横幅写清完整度（**partial** 或更严）+ 必要时 `ask_user`。

## 分析架构（投研方法）

- **问题/假设**：所选指标在 LEAN 语境下如何定义？参数敏感度与常见误用是什么？
- **证据清单**：平台返回的指标序列/图表（事实）；用户选定的参数与标的（假设）；「可能滞后/钝化」等解读（推断）
- **多维交叉验证**：短周期 vs 长周期；价格结构 vs 指标方向；手册定义 vs 平台字段是否同名同义
- **结论与不确定**：手册不等于可交易系统；样本与实现差异须披露
- **风险与缺口**：缺指标序列、标的未确认、跨市场算法差异
- **微观/制度风险**：涨跌停钝化、T+1、ST/停牌、融券受限（及相关会计口径差异）；不得按美股连续可成交或自由做空假设叙事
- **事实 | 假设 | 推断** 分栏强制

## 数据维度

| 维度 | 取数方向 | 缺失时 |
|------|----------|--------|
| 标的（可选示例） | `search_instruments` / `ask_user` | 纯概念章可不绑标的 |
| 快照 | `get_instrument_snapshot` | 标明无现价 |
| 指标 | `get_instrument_indicators` | 仅写定义与公式章 |
| 图表 | `get_instrument_chart` | 不虚构走势 |
| 参数确认 | `ask_user` | 用常见默认并标为假设 |
| 计算/落盘 | `opptrix_run` / `workspace_write` | 可选 |
| 交付 | `list_web_vendor` → `create_web` | 用户只要口头要点时可跳过 |
| 市场/微观结构 | CN 指标工具 | 指标不可用则跳过该条 |


## 步骤

1. **确认默认 CN**：标的/宇宙为 A股或场内 ETF（用户点名其他市场再切换并声明差异）。应用涨跌停/T+1/融券受限等微观约束（见 A股适配）。
2. **确认范围**：指标族（MA/EMA、RSI、MACD、布林等）与是否需要示例标的。
3. **写清 LEAN 溯源边界**：说明灵感来自 LEAN 文档/示例；本会话**不**启动 LEAN Runtime。
4. **按需取数**：有标的则拉指标/图表；无则保持定义与参数表。
5. **对照表**：定义 → 典型参数 → 信号逻辑 → 局限/过拟合警示。
6. **事实/假设/推断分栏**输出解读。
7. **交付网页（默认）**：`list_web_vendor` → `create_web`；已有则 `read_web` / `update_web`。

## 网页报告建议目录

1. 范围：默认 A股/场内 ETF + LEAN 溯源
2. 指标定义与参数表  
3. 信号逻辑与常见组合  
4. 示例标的数据（若有，带时效）  
5. 事实 / 假设 / 推断分栏  
6. 局限、过拟合与后续技能指引  
7. A股适配与限制（默认 CN；微观结构/代理/完整度）
8. 免责声明（无买卖建议；非 LEAN 官方回测）

## 禁止

- 荐股、目标价、仓位建议；编造未返回的指标值  
- **禁止假装跑完整 LEAN 引擎**或伪造 LEAN 日志/回测净值  
- **禁止无交付就结束**（默认须有 web 产物，除非用户明确只要口头要点）  
- 把手册写成「保证有效的交易系统」
- 禁止把美股成分/ETF 清单不经映射直接当 A股结果
- 禁止假设可自由融券做空
