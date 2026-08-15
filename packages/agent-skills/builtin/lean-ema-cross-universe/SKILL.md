---
name: lean-ema-cross-universe
description: LEAN 启发的均线交叉宇宙筛工作流。用户说「均线宇宙」「EMA 金叉选股」「宇宙均线交叉」「ema cross universe」「/lean-ema-cross-universe」时使用。方法溯源 QuantConnect LEAN Universe + EMA 交叉示例；批量规则命中表。默认 A股适配。默认 create_web。禁止假装跑完整 LEAN 引擎。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: LEAN均线宇宙
  summary: A股成分宇宙上的均线交叉命中表
  category: quant
  slash-rank: "455"
  default-deliverable: web
  required-packs: industry market instrument_analytics artifacts
allowed-tools: get_index_constituents get_sector_constituents get_sector_list batch_instrument_snapshots get_instrument_indicators get_instrument_chart search_instruments ask_user opptrix_run workspace_write workspace_read create_web update_web read_web list_web_vendor
---

# LEAN 均线交叉宇宙

方法溯源 **QuantConnect LEAN** 中 Universe Selection + EMA/MA 交叉过滤的算法思路；本技能产出**宇宙内规则命中事实表**，**禁止假装跑完整 LEAN 引擎**。

## 何时使用

用户要在 **A股指数/板块成分或自建池**上，按快慢均线交叉（或价格相对 EMA）做**批量筛选**（LEAN 方法溯源，非美股原版照搬）。

边界：通用条件筛选（非均线专用）用 `@skill:universe-screen`；单票均线诊断用 `@skill:lean-ma-cross-trend`；指标手册用 `@skill:lean-indicator-playbook`。入选≠看好。默认交付网页。

## A股适配（默认）

- 默认市场 **CN（A股 / 场内 ETF）**。用户点名美股/港股再切换，并声明数据口径与微观结构差异。
- 默认宇宙：CN 指数/板块成分（`get_index_constituents` / `get_sector_constituents`）。
- 涨跌停可使均线交叉信号当日不可成交；T+1 影响日内交叉叙事。
- 融券受限 → 宇宙信号默认「仅多头排序」，禁止对称空头腿。
- 不可硬适配或数据缺口时：首页横幅写清完整度（**partial** 或更严）+ 必要时 `ask_user`。

## 分析架构（投研方法）

- **问题/假设**：在给定宇宙与均线规则下，哪些标的当前命中金叉/站上 EMA？
- **证据清单**：成分列表与指标状态（事实）、规则参数（假设）、名单含义（推断）
- **多维交叉验证**：命中计数 vs 表行；缺失指标不得当通过
- **结论与不确定**：批量数据稀疏；交叉滞后
- **风险与缺口**：宇宙过大、指标工具限流、参数未确认
- **微观/制度风险**：涨跌停钝化、T+1、ST/停牌、融券受限（及相关会计口径差异）；不得按美股连续可成交或自由做空假设叙事
- **事实 | 假设 | 推断** 分栏强制

## 数据维度

| 维度 | 取数方向 | 缺失时 |
|------|----------|--------|
| 宇宙 | `get_index_constituents` / `get_sector_constituents` / `ask_user` | 用户给代码清单 |
| 筛选规则 | `ask_user`（快慢周期） | 显式默认并标假设 |
| 批量行情 | `batch_instrument_snapshots` | 缩小宇宙 |
| 均线/指标 | `get_instrument_indicators`（抽样或分批） | 标明覆盖率不足 |
| 图表抽检 | `get_instrument_chart` | 可选 |
| 计算 | `opptrix_run` / `workspace_write` | 可选 |
| 交付 | `list_web_vendor` → `create_web` | 可跳过口头要点 |
| A股宇宙 | 指数/板块成分 + CN 行情 | 无成分则 ask_user 自建池 |


## 步骤

1. **确认默认 CN**：标的/宇宙为 A股或场内 ETF（用户点名其他市场再切换并声明差异）。应用涨跌停/T+1/融券受限等微观约束（见 A股适配）。
2. **确认宇宙与均线规则**（EMA/MA、周期、金叉或站上）。
3. **声明非 LEAN Runtime**；入选≠荐股。
4. **拉取成分 + 分批指标**；记录覆盖率与失败项。
5. **输出命中表**；缺失字段不计通过。
6. **分栏结论** → 默认 `create_web`。

## 网页报告建议目录

1. 范围：默认 A股/场内 ETF + LEAN 溯源
2. 数据覆盖率与时效  
3. 命中事实表  
4. 未覆盖/失败清单  
5. 事实 / 假设 / 推断  
6. 与 `@skill:universe-screen` 的差异说明  
7. A股适配与限制（默认 CN；微观结构/代理/完整度）
8. 免责声明（命中表≠荐股池）

## 禁止

- 荐股；把命中表写成「明日涨停名单」  
- **禁止假装跑完整 LEAN 引擎**或伪造全宇宙回测  
- 缺指标却标为命中  
- **禁止无交付就结束**（默认 web）  
- 与 `@skill:universe-screen` 混淆：本技能**专攻均线交叉规则**；通用多条件筛选用 universe-screen
- 禁止把美股成分/ETF 清单不经映射直接当 A股结果
- 禁止假设可自由融券做空
