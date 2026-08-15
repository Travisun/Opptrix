---
name: ah-compare
description: AH 对照工作流。用户说「AH」「A+H」「溢价」「两地上市」「/ah-compare」时使用。汇率假设须显式；无 AH 专用 capability。默认 create_web。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: AH对照
  summary: A/H 股价与溢价对照（汇率显式）
  category: cn-market
  slash-rank: "330"
  default-deliverable: web
  required-packs: fundamentals market artifacts
allowed-tools: search_instruments get_instrument_snapshot get_instrument_profile get_instrument_financials get_instrument_chart ask_user create_web update_web read_web list_web_vendor
---

# AH 对照

## 何时使用

用户要对照**同一公司 A 股与 H 股**价格/溢价/基本面差异。边界：vs `@skill:comps-analysis`——同业 Trading Comps 倍数表；**AH 溢价 ≠ 同业倍数**，本技能只做同一公司两地对照（须显式汇率假设）。

**能力声明**：无 AH 专用 capability；溢价计算依赖用户确认或显式声明的**汇率假设**。

## 分析架构（投研方法）

- **问题/假设**：AH 溢价处于何水平？两地流动性/估值叙事差在哪？
- **证据清单**：双侧快照/图表/概况/财务
- **多维交叉验证**：价格溢价 vs 财务同一套报表；交易时段差异
- **事实 | 假设 | 推断** 分栏：汇率为假设

## 数据维度

| 维度 | 取数方向 | 缺失时 |
|------|----------|--------|
| A/H 代码 | `search_instruments` / `ask_user` | 先确认配对 |
| 双侧快照 | `get_instrument_snapshot` | 标明缺失侧 |
| 汇率 | `ask_user` 或显式假设并写入报告 | **禁止**静默用未声明汇率算溢价 |
| 概况/财务 | `get_instrument_profile` / `get_instrument_financials` | 从简 |
| 图表 | `get_instrument_chart` | 文字 |
| 交付 | `list_web_vendor` → `create_web` | 可跳过口头要点 |

## 步骤

1. **确认 A/H 代码对**。
2. **显式汇率假设**（写入报告抬头）。
3. **双侧快照/图/财务** → 溢价表。
4. **交付网页（默认）**。

## 网页报告建议目录

1. 代码对、汇率假设与能力声明
2. 价格与溢价表
3. 双侧图表
4. 基本面对照
5. 事实 / 假设 / 推断
6. 免责声明

## 禁止

- 未声明汇率却输出「精确溢价」
- 荐股或「折溢价收敛必赚」
- **禁止无交付就结束**
