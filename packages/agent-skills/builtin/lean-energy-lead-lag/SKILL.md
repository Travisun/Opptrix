---
name: lean-energy-lead-lag
description: LEAN 启发的能源链领先滞后工作流。用户说「能源领先滞后」「原油链 lead lag」「/lean-energy-lead-lag」时使用。跨标的滞后相关示意；默认 A股适配。默认 create_web。禁止假装 LEAN 引擎。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: LEAN能源领先滞后
  summary: 国内能源链标的领先滞后相关示意
  category: macro
  slash-rank: "510"
  default-deliverable: web
  required-packs: market news workspace artifacts
allowed-tools: search_instruments get_instrument_quotes get_instrument_chart get_instrument_snapshot get_index_constituents get_sector_constituents get_sector_list ask_user opptrix_run workspace_write workspace_read create_web update_web read_web list_web_vendor
---

# LEAN 能源领先滞后

方法溯源 **QuantConnect LEAN** 社区算法/示例思路；本技能是**平台工具编排的投研工作流**，**禁止假装跑完整 LEAN 引擎**或输出 LEAN 回测曲线、订单日志冒充引擎结果。实际取数与计算仅限 Opptrix 工具（行情/财务/`opptrix_run` 沙盒等）。

## 何时使用

用户要在 **A股/场内 ETF** 能源相关标的（煤、油、电力、相关权益等）之间探索领先/滞后相关示意（LEAN 方法溯源，非美股原版照搬）。默认交付可预览网页。

边界：一般跨资产对照用 `@skill:cross-asset`；宏观叙事用 `@skill:macro-brief`。领先滞后为**统计示意**，禁止因果断言与交易指令。

## A股适配（默认）

- 默认市场 **CN（A股 / 场内 ETF）**。用户点名美股/港股再切换，并声明数据口径与微观结构差异。
- 默认 **国内能源 / 油气相关 ETF 或股票** 代理，**非**美天然气/WTI 期货对。
- 用户点名美能源商品再切换并声明。
- 微观结构：涨跌停削弱领先滞后统计；融券受限 → 多空模板改为多头排序或空仓。
- 不可硬适配或数据缺口时：首页横幅写清完整度（**partial** 或更严）+ 必要时 `ask_user`。

## 分析架构（投研方法）

- **问题/假设**：在给定滞后阶数下，谁对谁更「领先」？
- **证据清单**：多标的收益/价格序列、滞后相关表
- **多维交叉验证**：不同滞后阶；子样本稳定性
- **结论与不确定**：相关≠因果；结构断点常见
- **微观/制度风险**：涨跌停钝化、T+1、ST/停牌、融券受限（及相关会计口径差异）；不得按美股连续可成交或自由做空假设叙事
- **事实 | 假设 | 推断** 分栏强制

## 数据维度

| 维度 | 取数方向 | 缺失时 |
|------|----------|--------|
| 标的链 | `ask_user` / 搜索 | 先确认清单 |
| 序列 | `get_instrument_quotes` / chart | 缺序列则缩小链 |
| 滞后相关 | `opptrix_run` | 仅展示表并标假设 |
| 交付 | `list_web_vendor` → `create_web` | 可跳过口头要点 |
| A股能源代理 | 国内能源/油气 ETF 或板块成分 | 无合适代理 → ask_user；禁止硬套美气油 |


## 步骤

1. **确认默认 CN**：标的/宇宙为 A股或场内 ETF（用户点名其他市场再切换并声明差异）。应用涨跌停/T+1/融券受限等微观约束（见 A股适配）。
2. **确认链条与样本期**：滞后阶数范围
3. **LEAN 溯源边界**：不跑 LEAN
4. **计算滞后相关矩阵**：稳定性检查
5. **分栏结论**：禁止交易指令
6. **交付网页（默认）**：`create_web`

## 网页报告建议目录

1. 范围：默认 A股/场内 ETF + LEAN 溯源
2. 滞后相关表/热力
3. 稳定性与断点警示
4. 事实 / 假设 / 推断分栏
5. 与宏观叙事的边界
6. A股适配与限制（默认 CN；微观结构/代理/完整度）
7. 免责声明（无买卖建议）

## 禁止

- 荐股、目标价、仓位建议；编造未返回数字
- 把滞后相关写成确定因果或跟单指令
- **禁止假装跑完整 LEAN 引擎**或伪造 LEAN 日志/回测净值
- **禁止无交付就结束**（默认须有 web 产物，除非用户明确只要口头要点）
- 禁止把美股成分/ETF 清单不经映射直接当 A股结果
- 禁止假设可自由融券做空
