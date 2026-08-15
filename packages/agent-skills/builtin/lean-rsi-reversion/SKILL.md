---
name: lean-rsi-reversion
description: LEAN 启发的 RSI 均值回归工作流。用户说「RSI 超买超卖」「RSI 回归」「RSI reversion」「/lean-rsi-reversion」时使用。方法溯源 QuantConnect LEAN RSI 示例；用平台指标解读阈值状态。默认 A股适配。默认 create_web。禁止假装跑完整 LEAN 引擎。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: LEAN RSI回归
  summary: A股/场内ETF RSI超买超卖回归解读
  category: quant
  slash-rank: "410"
  default-deliverable: web
  required-packs: instrument_analytics artifacts
allowed-tools: search_instruments get_instrument_snapshot get_instrument_indicators get_instrument_chart ask_user opptrix_run workspace_write workspace_read create_web update_web read_web list_web_vendor
---

# LEAN RSI 均值回归

方法溯源 **QuantConnect LEAN** 中 RSI 超买/超卖与均值回归类算法思路；本技能做**阈值状态与规则解读**，**禁止假装跑完整 LEAN 引擎**。

## 何时使用

用户要在 **A股/场内 ETF** 上看 **RSI** 是否进入超买/超卖区、是否出现回归迹象（LEAN 方法溯源，非美股原版照搬）。

边界：指标手册用 `@skill:lean-indicator-playbook`；趋势均线用 `@skill:lean-ma-cross-trend`；平台综合信号用 `@skill:instrument-signals`。默认交付网页。

## A股适配（默认）

- 默认市场 **CN（A股 / 场内 ETF）**。用户点名美股/港股再切换，并声明数据口径与微观结构差异。
- 默认 CN 标的；涨跌停区间 RSI 常钝化（持续极限值），回归假设须分层说明。
- 禁止自由做空「超买做空」模板。
- 不可硬适配或数据缺口时：首页横幅写清完整度（**partial** 或更严）+ 必要时 `ask_user`。

## 分析架构（投研方法）

- **问题/假设**：在约定 RSI 周期与阈值下，标的是否处于极端区？价格是否已出现背离或回归？
- **证据清单**：RSI 序列与价格（事实）、阈值/周期（假设）、回归概率叙述（推断）
- **多维交叉验证**：RSI 极值 vs 价格新高新低；与趋势均线是否冲突（趋势市慎用回归）
- **结论与不确定**：强趋势中「超买可更超买」；阈值任意性
- **风险与缺口**：缺 RSI、周期过短、阈值未约定
- **微观/制度风险**：涨跌停钝化、T+1、ST/停牌、融券受限（及相关会计口径差异）；不得按美股连续可成交或自由做空假设叙事
- **事实 | 假设 | 推断** 分栏强制

## 数据维度

| 维度 | 取数方向 | 缺失时 |
|------|----------|--------|
| 标的 | `search_instruments` / `ask_user` | 先确认 |
| 快照 | `get_instrument_snapshot` | 标明无现价 |
| RSI/指标 | `get_instrument_indicators` | not-feasible |
| 图表 | `get_instrument_chart` | 不虚构 |
| 阈值/周期 | `ask_user` | 显式默认（如 30/70）并标假设 |
| 计算 | `opptrix_run` | 可选 |
| 交付 | `list_web_vendor` → `create_web` | 可跳过口头要点 |
| 市场/微观结构 | CN 行情 + RSI | 涨跌停钝化则标注 |


## 步骤

1. **确认默认 CN**：标的/宇宙为 A股或场内 ETF（用户点名其他市场再切换并声明差异）。应用涨跌停/T+1/融券受限等微观约束（见 A股适配）。
2. **确认标的、RSI 周期与超买超卖阈值**。
3. **声明非 LEAN Runtime**。
4. **取 RSI 与价格结构**，标注时效。
5. **判定区域与背离**（若可观察）；注明趋势市冲突。
6. **分栏结论** → 默认 `create_web`。

## 网页报告建议目录

1. 范围：默认 A股/场内 ETF + LEAN 溯源
2. RSI 定义与阈值规则  
3. 当前读数与区域（事实）  
4. 背离/冲突检查  
5. 事实 / 假设 / 推断  
6. 局限与观察清单  
7. A股适配与限制（默认 CN；微观结构/代理/完整度）
8. 免责声明（无买卖建议）

## 禁止

- 荐股；把超卖写成「抄底建议」  
- **禁止假装跑完整 LEAN 引擎**或编造 RSI 历史胜率  
- **禁止无交付就结束**（默认 web）  
- 静默改阈值却当作事实
- 禁止把美股成分/ETF 清单不经映射直接当 A股结果
- 禁止假设可自由融券做空
