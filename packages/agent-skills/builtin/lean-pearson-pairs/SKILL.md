---
name: lean-pearson-pairs
description: LEAN 启发的 Pearson 相关配对工作流。用户说「Pearson 配对」「相关系数配对」「相关篮」「/lean-pearson-pairs」时使用。仅相关/滚动相关；禁止写成协整。与 @skill:pairs-rv 边界清晰。默认 A股适配。默认 create_web。禁止假装 LEAN 引擎。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: LEAN Pearson配对
  summary: A股标的Pearson相关配对候选（非协整）
  category: quant
  slash-rank: "480"
  default-deliverable: web
  required-packs: market workspace artifacts
allowed-tools: search_instruments get_instrument_snapshot get_instrument_chart get_instrument_quotes ask_user opptrix_run workspace_write workspace_read create_web update_web read_web list_web_vendor
---

# LEAN Pearson配对

方法溯源 **QuantConnect LEAN** 社区算法/示例思路；本技能是**平台工具编排的投研工作流**，**禁止假装跑完整 LEAN 引擎**或输出 LEAN 回测曲线、订单日志冒充引擎结果。实际取数与计算仅限 Opptrix 工具（行情/财务/`opptrix_run` 沙盒等）。

> **能力声明（assumption-only）**：本技能仅提供 **Pearson/滚动相关** 描述统计。本地**无原生协整/Johansen 库**；**禁止**声明「已协整」或输出协整 p 值。需要价差框架请转 `@skill:pairs-rv`（同样禁止假装协整检验通过）。完整度：**assumption-only**。

## 何时使用

用户要在 **A股/场内 ETF** 上基于 **Pearson（或滚动）相关系数** 找配对/相关篮候选（LEAN 方法溯源，非美股原版照搬）。默认交付可预览网页。

边界：价差/比值相对价值与协整讨论用 `@skill:pairs-rv`（亦无原生协整库）。本技能**只做相关统计**，**不得**把高相关写成「已协整」或可开多空价差指令。

## A股适配（默认）

- 默认市场 **CN（A股 / 场内 ETF）**。用户点名美股/港股再切换，并声明数据口径与微观结构差异。
- 默认配对：**AH 对**（若两边可得）或 **同业 A股对**；禁止默认美股配对清单。
- **融券/做空受限**：配对交易模板默认改为相关监测 + 多头侧示意，或「多头+空仓」；禁止假设可自由做空完成经典多空价差。
- 完整度：纯相关分析 **partial**；可交易多空价差常为 **not-feasible-now**（需声明）。
- 不可硬适配或数据缺口时：首页横幅写清完整度（**partial** 或更严）+ 必要时 `ask_user`。

## 分析架构（投研方法）

- **问题/假设**：哪些标的对在样本期内高相关？相关是否稳定？
- **证据清单**：多标的行情序列、相关矩阵、滚动相关（若可算）
- **多维交叉验证**：全样本相关 vs 滚动相关；高相关 vs 价差是否均值回归（仅描述，不作协整证明）
- **结论与不确定**：相关≠因果；相关≠协整
- **微观/制度风险**：涨跌停钝化、T+1、ST/停牌、融券受限（及相关会计口径差异）；不得按美股连续可成交或自由做空假设叙事
- **事实 | 假设 | 推断** 分栏强制

## 数据维度

| 维度 | 取数方向 | 缺失时 |
|------|----------|--------|
| 标的清单 | `search_instruments` / `ask_user` | 先确认 |
| 行情序列 | `get_instrument_quotes` / chart | 标明缺失侧 |
| 相关计算 | `opptrix_run` | 仅展示散点/表并标假设 |
| 交付 | `list_web_vendor` → `create_web` | 可跳过口头要点 |
| 市场/微观结构 | AH 或同业 A 股对；相关矩阵 | 不可做空 → 禁止经典多空模板；横幅说明 |


## 步骤

1. **确认默认 CN**：标的/宇宙为 A股或场内 ETF（用户点名其他市场再切换并声明差异）。应用涨跌停/T+1/融券受限等微观约束（见 A股适配）。
2. **确认标的与样本期**：窗口、收益口径（日/周）
3. **能力横幅**：无协整声明；与 `@skill:pairs-rv` 分工写清
4. **取序列并算相关**：矩阵 + 可选滚动相关
5. **解读**：事实/假设/推断；禁止开平仓指令
6. **交付网页（默认）**：`create_web`

## 网页报告建议目录

1. 范围：默认 A股/场内 ETF + LEAN 溯源；仅 Pearson 无协整
2. LEAN 溯源与「非引擎」声明
3. 样本期与收益口径
4. 相关矩阵与候选对
5. 滚动稳定性（若有）
6. 事实 / 假设 / 推断分栏
7. 与 pairs-rv 边界说明
8. A股适配与限制（默认 CN；微观结构/代理/完整度）
9. 免责声明（无开平仓建议）

## 禁止

- 荐股、目标价、仓位建议；编造未返回数字
- 声称协整成立或编造协整统计量
- 输出「开多A空B」交易指令
- 与 `@skill:pairs-rv` 混淆表述
- **禁止假装跑完整 LEAN 引擎**或伪造 LEAN 日志/回测净值
- **禁止无交付就结束**（默认须有 web 产物，除非用户明确只要口头要点）
- 禁止把美股成分/ETF 清单不经映射直接当 A股结果
- 禁止假设可自由融券做空
