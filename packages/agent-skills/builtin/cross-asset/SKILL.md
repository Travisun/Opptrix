---
name: cross-asset
description: 跨资产对照工作流。用户说「跨资产」「股债商品」「多市场对照」「/cross-asset」时使用。多市场 snapshot/chart 对照；非风险平价。默认 create_web。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: 跨资产对照
  summary: 多市场标的快照与结构对照
  category: macro
  slash-rank: "300"
  default-deliverable: web
  required-packs: market artifacts
allowed-tools: search_instruments get_instrument_snapshot batch_instrument_snapshots get_instrument_chart get_market_dynamics ask_user create_web update_web read_web list_web_vendor
---

# 跨资产对照

## 何时使用

用户要**股票/指数/商品/汇率等跨资产**并排对照，而非单一市场深度或风险平价组合优化。

**边界**：本技能做**描述性对照**，**不是**风险平价（Risk Parity）权重求解；宏观叙事与序列解读用 `@skill:macro-brief`，风格/板块相对强弱用 `@skill:style-rotation`，本技能不做二者替代。

## 分析架构（投研方法）

- **问题/假设**：各资产近期方向与波动是否同向？叙事是否一致？
- **证据清单**：多标的快照、图表、可选市场动态
- **多维交叉验证**：价格方向 vs 波动；跨市场交易时段差异
- **事实 | 假设 | 推断** 分栏

## 数据维度

| 维度 | 取数方向 | 缺失时 |
|------|----------|--------|
| 资产清单 | `ask_user` / `search_instruments` | 先确认 |
| 快照 | `batch_instrument_snapshots` / `get_instrument_snapshot` | 逐个降级 |
| 图表 | `get_instrument_chart` | 文字区间 |
| 背景 | `get_market_dynamics` | 可省略 |
| 交付 | `list_web_vendor` → `create_web` | 可跳过口头要点 |

## 步骤

1. **确认资产篮子**与对照窗口。
2. **批量快照 + 图表**。
3. **对照表**（涨跌、波动描述）；声明非风险平价。
4. **交付网页（默认）**。

## 网页报告建议目录

1. 资产篮子与时效
2. 快照对照表
3. 结构图（多序列）
4. 叙事交叉验证（事实 / 推断）
5. 缺口与声明（非风险平价）
6. 免责声明

## 禁止

- 输出风险平价权重或「最优配置」假装优化器结果
- 荐股；编造跨资产相关性矩阵（无计算时）
- **禁止无交付就结束**
