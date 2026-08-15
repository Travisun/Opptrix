---
name: lean-ma-cross-trend
description: LEAN 启发的均线交叉趋势工作流。用户说「均线金叉」「双均线」「MA cross」「趋势跟踪均线」「/lean-ma-cross-trend」时使用。方法溯源 QuantConnect LEAN 均线交叉示例；用平台行情/指标做规则解读。默认 A股适配。默认 create_web。禁止假装跑完整 LEAN 引擎。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: LEAN均线趋势
  summary: A股标的双均线交叉趋势规则解读
  category: quant
  slash-rank: "405"
  default-deliverable: web
  required-packs: instrument_analytics artifacts
allowed-tools: search_instruments get_instrument_snapshot get_instrument_indicators get_instrument_chart ask_user opptrix_run workspace_write workspace_read create_web update_web read_web list_web_vendor
---

# LEAN 均线交叉趋势

方法溯源 **QuantConnect LEAN** 中常见的双均线交叉 / 趋势跟踪算法思路；本技能用平台指标做**规则状态解读**，**禁止假装跑完整 LEAN 引擎**。

## 何时使用

用户要对 **A股/场内 ETF** 单标的或小集合做均线交叉（如快慢 MA/EMA）趋势规则诊断（LEAN 方法溯源，非美股原版照搬）。

边界：指标定义手册用 `@skill:lean-indicator-playbook`；平台综合策略信号用 `@skill:instrument-signals`；全宇宙批量均线筛选用 `@skill:lean-ema-cross-universe`。默认交付网页。

## A股适配（默认）

- 默认市场 **CN（A股 / 场内 ETF）**。用户点名美股/港股再切换，并声明数据口径与微观结构差异。
- 默认 CN 标的；**涨跌停会使均线交叉信号钝化或当日不可成交**，须一句标注。
- T+1 影响「交叉当日交易」叙事；禁止做空金叉/死叉对称交易假设。
- 不可硬适配或数据缺口时：首页横幅写清完整度（**partial** 或更严）+ 必要时 `ask_user`。

## 分析架构（投研方法）

- **问题/假设**：在约定快慢均线参数下，当前处于金叉/死叉/纠缠何种状态？趋势是否与价格结构一致？
- **证据清单**：价格与均线序列（事实）、用户参数（假设）、延续/反转可能性（推断）
- **多维交叉验证**：快慢线相对位置 vs 价格相对均线；短窗 vs 长窗冲突
- **结论与不确定**：交叉信号滞后；震荡市假信号多
- **风险与缺口**：样本过短、缺指标、参数未确认
- **微观/制度风险**：涨跌停钝化、T+1、ST/停牌、融券受限（及相关会计口径差异）；不得按美股连续可成交或自由做空假设叙事
- **事实 | 假设 | 推断** 分栏强制

## 数据维度

| 维度 | 取数方向 | 缺失时 |
|------|----------|--------|
| 标的 | `search_instruments` / `ask_user` | 先确认再分析 |
| 快照 | `get_instrument_snapshot` | 标明无现价 |
| 均线/指标 | `get_instrument_indicators` | not-feasible 或仅文字规则 |
| 图表 | `get_instrument_chart` | 不画假图 |
| 参数 | `ask_user`（周期） | 用显式默认并标假设 |
| 计算 | `opptrix_run` | 可选 |
| 交付 | `list_web_vendor` → `create_web` | 可跳过口头要点 |
| 市场/微观结构 | CN 行情 + 均线 | 涨跌停日信号标失效风险 |


## 步骤

1. **确认默认 CN**：标的/宇宙为 A股或场内 ETF（用户点名其他市场再切换并声明差异）。应用涨跌停/T+1/融券受限等微观约束（见 A股适配）。
2. **确认标的与均线参数**（快/慢周期、MA 或 EMA）。
3. **声明非 LEAN Runtime**：仅方法溯源，不跑引擎。
4. **拉取指标与图表**，标注数据时效。
5. **判定规则状态**：金叉/死叉/纠缠；与价格位置交叉验证。
6. **分栏结论**后默认 `create_web` 交付。

## 网页报告建议目录

1. 范围：默认 A股/场内 ETF + LEAN 溯源
2. 均线定义与交叉规则  
3. 当前状态（事实，带时效）  
4. 与价格结构的交叉验证  
5. 事实 / 假设 / 推断  
6. 局限、假信号与观察清单  
7. A股适配与限制（默认 CN；微观结构/代理/完整度）
8. 免责声明（信号≠买卖建议）

## 禁止

- 荐股；把金叉写成「买入指令」  
- **禁止假装跑完整 LEAN 引擎**或伪造历史交叉胜率  
- **禁止无交付就结束**（默认 web）  
- 编造未返回的均线数值
- 禁止把美股成分/ETF 清单不经映射直接当 A股结果
- 禁止假设可自由融券做空
