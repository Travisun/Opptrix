---
name: instrument-signals
description: 标的信号 / 指标分析工作流（evaluate_instrument / get_instrument_strategy_signal / get_instrument_indicators / get_instrument_chart）。用户说「技术指标」「策略信号」「评估一下」「看指标」「evaluate_instrument」「/instrument-signals」时使用。拉取评估与指标后结构化解读；默认用 create_web 交付可预览 HTML；信号≠荐股。
license: Apache-2.0
metadata:
  author: opptrix
  version: "2.0"
  title: 标的信号
  summary: 指标与策略信号，结构化解读
  category: equity
  slash-rank: "60"
  default-deliverable: web
  required-packs: instrument_analytics artifacts
allowed-tools: evaluate_instrument get_instrument_strategy_signal get_instrument_indicators get_instrument_chart create_web update_web read_web list_web_vendor create_canvas create_mindmap
---

# 标的信号 / 指标分析

## 何时使用

用户要对某标的看**技术指标、策略信号或量化评估结果**（不是完整基本面尽调，也不是 ETF 持仓研究）。默认交付**可预览网页**。

## 分析架构（投研方法）

- **问题/假设**：当前价格结构与策略规则下，信号处于何种状态？多空证据是否一致？
- **证据清单**：评估结果、策略信号、技术指标序列、图表/K 线结构
- **多维交叉验证**：策略信号 vs 指标方向；短周期 vs 长周期是否冲突
- **结论与不确定**：信号状态为工具返回事实；「可能延续/反转」为推断；注明过拟合与滞后风险
- **风险与缺口**：缺指标、评估失败、样本过短
- **事实与推断必须分开**：**信号 ≠ 买卖建议**

## 数据维度

| 维度 | 取数方向 | 缺失时 |
|------|----------|--------|
| 标的 | 搜索定位 `instrument` | 多候选请用户选择 |
| 综合评估 | `evaluate_instrument` | 说明评估不可用 |
| 策略信号 | `get_instrument_strategy_signal` | 仅写指标章 |
| 技术指标 | `get_instrument_indicators` | 省略指标表 |
| 图表 | `get_instrument_chart` | 不虚构走势 |
| 交付 | `list_web_vendor` → `create_web` | 用户只要口头要点时可跳过 |

## 步骤

1. **确认标的与关注周期/策略**（若用户未指定，用工具默认并说明）。
2. **按维度取数**：评估 / 信号 / 指标 / 图表（可并行）。
3. **交叉验证与结构化结论**：状态摘要 → 一致/冲突点 → 局限。
4. **交付网页（默认）**：`list_web_vendor` → `create_web`（可用本地 vendor 画指标图）；已有则 `read_web` / `update_web`。
5. **备选**：用户点名画布 / 结构图时改用对应工具。

## 网页报告建议目录

1. 标的与评估时效  
2. 策略信号状态（工具原文/结构化字段）  
3. 关键指标表与解读（推断标注）  
4. 多周期一致性检查  
5. 局限：滞后、样本、不适用场景  
6. 免责声明（信号≠荐股）

## 禁止

- 把信号表述为「应买入/卖出」  
- 编造未返回的指标值  
- **禁止无交付就结束**（默认须有 web 产物，除非用户明确只要口头要点）
