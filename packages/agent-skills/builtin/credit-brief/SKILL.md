---
name: credit-brief
description: 信用简报工作流。用户说「信用」「杠杆」「债务」「评级」「/credit-brief」时使用。not-feasible-now：杠杆可算；禁止伪造评级字母。默认 create_web。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: 信用简报
  summary: 杠杆与信用议题扫描（无伪造评级）
  category: event
  slash-rank: "360"
  default-deliverable: web
  required-packs: fundamentals news browser artifacts
allowed-tools: get_instrument_financials get_instrument_balance_sheet get_instrument_cash_flow get_instrument_profile list_news_articles browser_navigate browser_snapshot ask_user create_web update_web read_web list_web_vendor
---

# 信用简报

## 何时使用

用户要看**债务杠杆与信用相关议题**。边界：盈利质量/应计红旗用 `@skill:earnings-quality`；完整三表预测用 `@skill:financial-model`。本技能算**杠杆与覆盖率**并扫信用舆情，**禁止伪造外部评级字母**。

## 能力声明（开篇强制横幅）

> **not-feasible-now**：本地**无外部信用评级库**。可根据财务报表**计算杠杆与覆盖率**；**禁止伪造 AAA/AA 等评级字母**或假装拉取穆迪/标普/中债资信结果。

## 分析架构（投研方法）

- **问题/假设**：杠杆与偿债指标处于何水平？舆情是否指向信用事件？
- **证据清单**：财务三表、资讯/browser
- **事实 | 假设 | 推断** 分栏

## 数据维度

| 维度 | 取数方向 | 缺失时 |
|------|----------|--------|
| 财务 | `get_instrument_financials` / balance / cash_flow | 标明无法算杠杆 |
| 概况 | `get_instrument_profile` | 从简 |
| 舆情 | `list_news_articles` / browser | 无则不做舆情章 |
| 交付 | `list_web_vendor` → `create_web` | 可跳过口头要点 |

## 步骤

1. **开篇横幅**（无评级库）。
2. **计算杠杆/利息保障等**（公式写入报告）。
3. **舆情议题**仅带来源；交付网页。

## 网页报告建议目录

1. 能力声明横幅
2. 杠杆与覆盖率事实表
3. 债务结构（若可得）
4. 舆情/争议扫描
5. 事实 / 推断分栏
6. 免责声明

## 禁止

- **禁止伪造信用评级字母**
- 荐股；**禁止无交付就结束**
