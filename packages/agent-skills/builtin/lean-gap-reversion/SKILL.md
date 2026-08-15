---
name: lean-gap-reversion
description: LEAN 启发的跳空回归工作流。用户说「跳空回补」「缺口回归」「gap reversion」「/lean-gap-reversion」时使用。统计历史跳空与回补假设；默认 A股适配。默认 create_web。禁止假装 LEAN 引擎。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: LEAN跳空回归
  summary: A股跳空/涨跌停语境下的回归假设框架
  category: quant
  slash-rank: "485"
  default-deliverable: web
  required-packs: market instrument_analytics workspace artifacts
allowed-tools: search_instruments get_instrument_snapshot get_instrument_chart get_instrument_quotes get_instrument_indicators ask_user opptrix_run workspace_write workspace_read create_web update_web read_web list_web_vendor
---

# LEAN 跳空回归

方法溯源 **QuantConnect LEAN** 社区算法/示例思路；本技能是**平台工具编排的投研工作流**，**禁止假装跑完整 LEAN 引擎**或输出 LEAN 回测曲线、订单日志冒充引擎结果。实际取数与计算仅限 Opptrix 工具（行情/财务/`opptrix_run` 沙盒等）。

## 何时使用

用户要在 **A股/场内 ETF** 上研究**跳空缺口**的历史频率、幅度与「回补」描述统计（LEAN 方法溯源，须纳入涨跌停；非美股原版照搬）。默认交付可预览网页。

边界：一般技术信号诊断用 `@skill:instrument-signals`；指标手册用 `@skill:lean-indicator-playbook`。回补仅为历史描述，**禁止**写成明日必补。

## A股适配（默认）

- 默认市场 **CN（A股 / 场内 ETF）**。用户点名美股/港股再切换，并声明数据口径与微观结构差异。
- 默认取数优先 `search_instruments` / `get_index_constituents` / `get_sector_*` / `get_etf_*` 及 CN 可用指标与行情工具。
- **必须**处理涨跌停与一字板：涨停/跌停开盘或全日封板会使「跳空」定义与「回补」统计严重偏倚；须单独分层或剔除并在报告说明。
- T+1：隔夜缺口与次日可交易性叙述须诚实；禁止假设可自由做空对冲缺口。
- 不可硬适配或数据缺口时：首页横幅写清完整度（**partial** 或更严）+ 必要时 `ask_user`。

## 分析架构（投研方法）

- **问题/假设**：该标的跳空后回补的历史比例与耗时分布如何？
- **证据清单**：OHLC/报价序列、跳空事件表、回补统计
- **多维交叉验证**：上行跳空 vs 下行；有无消息日（若可得）
- **结论与不确定**：历史回补率≠未来；幸存者与样本偏差
- **微观/制度风险**：涨跌停钝化、T+1、ST/停牌、融券受限（及相关会计口径差异）；不得按美股连续可成交或自由做空假设叙事
- **事实 | 假设 | 推断** 分栏强制

## 数据维度

| 维度 | 取数方向 | 缺失时 |
|------|----------|--------|
| 标的 | `search_instruments` / `ask_user` | 先确认 |
| 行情 | `get_instrument_quotes` / chart | 样本过短则降级 |
| 事件统计 | `opptrix_run` | 手工列出近期跳空并标假设 |
| 交付 | `list_web_vendor` → `create_web` | 可跳过口头要点 |
| 市场/微观结构 | CN OHLC + 涨跌停/一字板标注 | 无法识别涨跌停则统计标 partial 并说明偏差 |


## 步骤

1. **确认默认 CN**：标的/宇宙为 A股或场内 ETF（用户点名其他市场再切换并声明差异）。应用涨跌停/T+1/融券受限等微观约束（见 A股适配）。
2. **确认标的与跳空定义**：隔夜缺口阈值阈值
3. **LEAN 溯源边界**：灵感来自缺口类示例；不跑 LEAN
4. **识别事件并统计**：回补定义写清
5. **分栏结论**：禁止交易指令
6. **交付网页（默认）**：`create_web`

## 网页报告建议目录

1. 范围：默认 A股/场内 ETF + LEAN 溯源
2. 跳空事件表
3. 回补统计与分布
4. 情景对照（若有）
5. 事实 / 假设 / 推断分栏
6. 局限与偏差
7. A股适配与限制（默认 CN；微观结构/代理/完整度）
8. 免责声明（无买卖建议）

## 禁止

- 荐股、目标价、仓位建议；编造未返回数字
- 「明日必回补」式断言
- 编造历史跳空事件
- **禁止假装跑完整 LEAN 引擎**或伪造 LEAN 日志/回测净值
- **禁止无交付就结束**（默认须有 web 产物，除非用户明确只要口头要点）
- 禁止把美股成分/ETF 清单不经映射直接当 A股结果
- 禁止假设可自由融券做空
