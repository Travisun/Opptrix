---
name: lean-magic-formula
description: LEAN 启发的神奇公式（Magic Formula）工作流。用户说「神奇公式」「Magic Formula」「Greenblatt」「/lean-magic-formula」时使用。收益/资本回报双因子排序；assumption-only 字段映射。默认 A股适配。默认 create_web。禁止假装 LEAN 引擎。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: LEAN质量价值筛选
  summary: 质量+便宜双因子排序（A股字段代理）
  category: quant
  slash-rank: "475"
  default-deliverable: web
  required-packs: fundamentals market industry artifacts
allowed-tools: get_index_constituents get_sector_constituents batch_instrument_snapshots get_instrument_financials search_instruments get_sector_list ask_user opptrix_run workspace_write workspace_read create_web update_web read_web list_web_vendor
---

# LEAN 神奇公式

方法溯源 **QuantConnect LEAN** 社区算法/示例思路；本技能是**平台工具编排的投研工作流**，**禁止假装跑完整 LEAN 引擎**或输出 LEAN 回测曲线、订单日志冒充引擎结果。实际取数与计算仅限 Opptrix 工具（行情/财务/`opptrix_run` 沙盒等）。

## 何时使用

用户要在 **A股/场内 ETF** 给定宇宙上做质量+便宜（Magic Formula 风格）双因子排序事实表（LEAN 方法溯源，A股字段代理；非美股原版照搬）。默认交付可预览网页。

边界：一般条件筛选用 `@skill:universe-screen`；单因子回测用 `@skill:factor-research`。本技能**不**承诺原书回测可复现，字段映射须显式假设。

## A股适配（默认）

- 默认市场 **CN（A股 / 场内 ETF）**。用户点名美股/港股再切换，并声明数据口径与微观结构差异。
- 默认宇宙：CN 宽基/板块成分 + `get_instrument_financials`；美股魔法公式清单仅溯源。
- 财务口径与美股不同须声明；涨跌停不影响排序计算但影响可交易性。
- 不做空；结果为多头候选排序。
- 不可硬适配或数据缺口时：首页横幅写清完整度（**partial** 或更严）+ 必要时 `ask_user`。

## 分析架构（投研方法）

- **问题/假设**：在可用财务字段下，双因子综合排序如何？
- **证据清单**：成分、财务字段、排序表
- **多维交叉验证**：单因子极端 vs 综合秩；缺失财务不得伪造
- **结论与不确定**：排序≠荐股；会计口径与原书可能不一致
- **微观/制度风险**：涨跌停钝化、T+1、ST/停牌、融券受限（及相关会计口径差异）；不得按美股连续可成交或自由做空假设叙事
- **事实 | 假设 | 推断** 分栏强制

## 数据维度

| 维度 | 取数方向 | 缺失时 |
|------|----------|--------|
| 宇宙 | 成分工具 / 用户清单 / `ask_user` | 先确认 |
| 财务字段 | `get_instrument_financials` | 缺字段剔除并计数 |
| 行情（可选） | `batch_instrument_snapshots` | 省略价列 |
| 排序计算 | `opptrix_run` | 手工秩并标假设 |
| 交付 | `list_web_vendor` → `create_web` | 可跳过口头要点 |
| A股财务宇宙 | CN 成分 + 财务指标 | 缺财务字段则跳过条件并标假设 |


## 步骤

1. **确认默认 CN**：标的/宇宙为 A股或场内 ETF（用户点名其他市场再切换并声明差异）。应用涨跌停/T+1/融券受限等微观约束（见 A股适配）。
2. **确认宇宙与字段映射**：EBIT/EV、ROC 等代理字段写清假设
3. **LEAN/文献溯源**：灵感来自社区 Magic Formula 实现；非 LEAN 引擎
4. **取财务并清洗**：缺失=剔除；报告时效
5. **双因子综合秩**：输出表；禁止荐股措辞
6. **交付网页（默认）**：`create_web`

## 网页报告建议目录

1. 范围：默认 A股/场内 ETF + LEAN 溯源
2. 宇宙与样本清洗规则
3. 单因子与综合排序表
4. 缺失与口径局限
5. 事实 / 假设 / 推断分栏
6. A股适配与限制（默认 CN；微观结构/代理/完整度）
7. 免责声明（非荐股；非原书复现保证）

## 禁止

- 荐股、目标价、仓位建议；编造未返回数字
- 把排序包装成「神奇公式必买清单」
- 编造财务比率
- **禁止假装跑完整 LEAN 引擎**或伪造 LEAN 日志/回测净值
- **禁止无交付就结束**（默认须有 web 产物，除非用户明确只要口头要点）
- 禁止把美股成分/ETF 清单不经映射直接当 A股结果
- 禁止假设可自由融券做空
