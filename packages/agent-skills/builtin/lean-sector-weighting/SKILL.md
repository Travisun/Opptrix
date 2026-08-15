---
name: lean-sector-weighting
description: LEAN 启发的行业加权工作流。用户说「行业加权」「板块权重」「sector weighting」「/lean-sector-weighting」时使用。目标权重 vs 实际/基准对照；默认 A股适配。默认 create_web。禁止假装 LEAN 引擎。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: LEAN行业加权
  summary: A股行业/板块权重配置与漂移对照
  category: quant
  slash-rank: "500"
  default-deliverable: web
  required-packs: industry portfolio market artifacts
allowed-tools: get_sector_list get_sector_constituents get_portfolio_holdings portfolio_summary batch_instrument_snapshots search_instruments get_index_constituents ask_user opptrix_run workspace_write workspace_read create_web update_web read_web list_web_vendor
---

# LEAN 行业加权

方法溯源 **QuantConnect LEAN** 社区算法/示例思路；本技能是**平台工具编排的投研工作流**，**禁止假装跑完整 LEAN 引擎**或输出 LEAN 回测曲线、订单日志冒充引擎结果。实际取数与计算仅限 Opptrix 工具（行情/财务/`opptrix_run` 沙盒等）。

## 何时使用

用户要在 **A股行业/板块**上做权重目标设定、实际持仓或基准对照与漂移表（LEAN 方法溯源，非美股原版照搬）。默认交付可预览网页。

边界：组合整体复盘用 `@skill:portfolio-review`；因子暴露用 `@skill:factor-exposure`；再平衡方案用 `@skill:rebalance`。

## A股适配（默认）

- 默认市场 **CN（A股 / 场内 ETF）**。用户点名美股/港股再切换，并声明数据口径与微观结构差异。
- 行业用 `get_sector_*`（申万/概念等）；权重对照默认 CN 指数行业结构。
- 不做空行业腿。
- 不可硬适配或数据缺口时：首页横幅写清完整度（**partial** 或更严）+ 必要时 `ask_user`。

## 分析架构（投研方法）

- **问题/假设**：行业权重相对目标/基准偏离多少？
- **证据清单**：板块分类、持仓或候选权重、对照表
- **多维交叉验证**：权重和=100%；分类口径一致
- **结论与不确定**：漂移表≠调仓指令
- **微观/制度风险**：涨跌停钝化、T+1、ST/停牌、融券受限（及相关会计口径差异）；不得按美股连续可成交或自由做空假设叙事
- **事实 | 假设 | 推断** 分栏强制

## 数据维度

| 维度 | 取数方向 | 缺失时 |
|------|----------|--------|
| 行业口径 | `get_sector_list` / `ask_user` | 先统一分类 |
| 实际/候选权重 | 组合持仓或用户表 | 仅目标示意 |
| 基准对照（可选） | 指数成分近似 | 标明非官方行业指数 |
| 交付 | `list_web_vendor` → `create_web` | 可跳过口头要点 |
| A股行业 | `get_sector_*` + 指数行业权重代理 | 无行业权重官方源则标假设 |


## 步骤

1. **确认默认 CN**：标的/宇宙为 A股或场内 ETF（用户点名其他市场再切换并声明差异）。应用涨跌停/T+1/融券受限等微观约束（见 A股适配）。
2. **确认分类与对象**：持仓/模型组合/基准
3. **LEAN 溯源边界**：灵感来自行业配置示例；不跑 LEAN
4. **汇总权重与漂移**：事实表
5. **交付网页（默认）**：`create_web`

## 网页报告建议目录

1. 范围：默认 A股/场内 ETF + LEAN 溯源
2. 目标 vs 实际/基准权重表
3. 漂移与集中度
4. 事实 / 假设 / 推断分栏
5. 缺口与分类局限
6. A股适配与限制（默认 CN；微观结构/代理/完整度）
7. 免责声明（无调仓指令）

## 禁止

- 荐股、目标价、仓位建议；编造未返回数字
- 输出具体调仓下单清单伪装成分析
- **禁止假装跑完整 LEAN 引擎**或伪造 LEAN 日志/回测净值
- **禁止无交付就结束**（默认须有 web 产物，除非用户明确只要口头要点）
- 禁止把美股成分/ETF 清单不经映射直接当 A股结果
- 禁止假设可自由融券做空
