---
name: thesis-memo
description: Buy-side 投资论点备忘。用户说「投资备忘」「thesis」「投资逻辑」「为什么买/为什么关注」「证伪条件」「/thesis-memo」时使用。默认 create_web；含证伪条件；evaluate_instrument 可选。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: 投资备忘
  summary: 论点、证据与证伪条件一页备忘
  category: decision
  slash-rank: "140"
  default-deliverable: web
  required-packs: fundamentals market news instrument_analytics artifacts
allowed-tools: search_instruments get_instrument_profile get_instrument_financials get_instrument_snapshot get_instrument_news evaluate_instrument ask_user create_web update_web read_web list_web_vendor
---

# 投资备忘（Thesis Memo）

## 何时使用

用户要写一份 **Buy-side 风格投资论点备忘**（核心论点、支撑证据、证伪条件、观察清单），而非完整尽调长文或投委会正式备忘。边界：全面尽调用 `@skill:equity-deep-dive`；正式 IC 材料用 `@skill:ic-memo`；专门攻击多头用 `@skill:bear-case`。

## 分析架构（投研方法）

- **问题/假设**：核心投资问题是什么？何种证据支持/削弱？
- **证据清单**：概况、财务、快照、资讯、（可选）量化评估
- **多维交叉验证**：叙事 vs 财务趋势；舆情 vs 价格位置；评估分 vs 基本面事实
- **结论与不确定**：论点为工作假设；须写清证伪条件与时间盒
- **风险与缺口**：缺关键财务、资讯噪音、评估工具不可用
- **事实 | 假设 | 推断** 分栏强制

## 数据维度

| 维度 | 取数方向 | 缺失时 |
|------|----------|--------|
| 标的 | `search_instruments` / `ask_user` | 先确认 |
| 概况 | `get_instrument_profile` | 业务章从简 |
| 财务 | `get_instrument_financials` | 论点降级为定性 |
| 行情 | `get_instrument_snapshot` | 标明无现价 |
| 资讯 | `get_instrument_news` | 省略舆情章 |
| 量化评估 | `evaluate_instrument`（可选） | 跳过，不编造评分 |
| 交付 | `list_web_vendor` → `create_web` | 用户只要口头要点时可跳过 |

## 步骤

1. **确认标的与投资问题**（增长/拐点/估值修复等）。
2. **收集证据**：概况/财务/快照/资讯；按需 `evaluate_instrument`。
3. **结构化备忘**：核心论点 → 证据 → 证伪条件 → 观察指标与时间盒。
4. **事实 | 假设 | 推断** 分栏写结论。
5. **交付网页（默认）**：`list_web_vendor` → `create_web`；已有则 `read_web` / `update_web`。

## 网页报告建议目录

1. 标的卡片与时效  
2. 投资问题与核心论点（假设）  
3. 支撑证据（事实表）  
4. 交叉验证与不确定（推断分栏）  
5. 证伪条件与观察清单  
6. 风险与数据缺口  
7. 免责声明（无买卖建议）

## 禁止

- 荐股、目标价、仓位建议；编造证据  
- **禁止无交付就结束**（默认须有 web 产物，除非用户明确只要口头要点）  
- 无证伪条件就结束  
- assumption / not-feasible 须诚实降级  
- 禁止把可选评估分写成「官方评级」
