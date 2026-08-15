---
name: strategy-report
description: 策略报告工作流（strategy_report）。用户说「策略报告」「策略总结」「策略表现报告」「出一份策略报告」「strategy_report」「/strategy-report」时使用。调用 strategy_report 结构化呈现；默认用 create_web 交付可预览 HTML；不做买卖建议。
license: Apache-2.0
metadata:
  author: opptrix
  version: "2.0"
  title: 策略报告
  summary: 策略表现与规则说明成文交付
  category: strategy
  slash-rank: "110"
  default-deliverable: web
  required-packs: strategy_extra artifacts
allowed-tools: strategy_report create_web update_web read_web list_web_vendor create_canvas create_mindmap
---

# 策略报告

## 何时使用

用户要一份**策略表现/规则说明类报告**（相对单次回测数字，更偏结构化叙述与汇总）。默认交付**可预览网页**。

## 分析架构（投研方法）

- **问题/假设**：策略规则、适用场景与历史表现如何被完整呈现？
- **证据清单**：`strategy_report` 返回的规则说明、表现摘要、对比基准（若有）
- **多维交叉验证**：规则描述 vs 表现指标是否口径一致；有基准则对照超额/回撤
- **结论与不确定**：报告为历史与规则事实汇总；外推标为不确定
- **风险与缺口**：策略标识无效、缺对比基准
- **事实与推断必须分开**

## 数据维度

| 维度 | 取数方向 | 缺失时 |
|------|----------|--------|
| 范围 | 策略标识、区间、基准（`ask_user`） | 先确认再调用 |
| 报告主体 | `strategy_report` | 说明失败原因 |
| 交付 | `list_web_vendor` → `create_web` | 用户只要口头要点时可跳过 |

## 步骤

1. **确认范围**：策略标识、区间、对比基准（若有）。
2. **调用** `strategy_report`。
3. **交叉验证与结构化结论**：规则 → 表现 → 风险与局限。
4. **交付网页（默认）**：`list_web_vendor` → `create_web`；已有则 `read_web` / `update_web`。
5. **备选**：用户点名画布 / 结构图时改用对应工具。

## 网页报告建议目录

1. 策略标识与报告区间  
2. 规则与假设说明  
3. 表现摘要与关键图表  
4. 与基准对比（若有）  
5. 风险、局限与数据缺口  
6. 免责声明（非投资建议）

## 禁止

- 荐股或编造表现数字  
- **禁止无交付就结束**（默认须有 web 产物，除非用户明确只要口头要点）
