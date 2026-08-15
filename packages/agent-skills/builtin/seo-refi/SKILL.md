---
name: seo-refi
description: 再融资条款工作流。用户说「再融资」「增发」「配股」「可转债条款」「SEO」「/seo-refi」时使用。not-feasible-now：从公告抽条款；无历史折价库假装。默认 create_web。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: 再融资条款
  summary: 从公告抽取再融资/增发条款
  category: event
  slash-rank: "355"
  default-deliverable: web
  required-packs: news browser artifacts
allowed-tools: get_instrument_notices get_notice_content list_news_articles browser_navigate browser_snapshot search_instruments ask_user create_web update_web read_web list_web_vendor
---

# 再融资条款

## 何时使用

用户要解读**增发/配股/可转债等再融资公告条款**。边界：一般公告精读用 `@skill:announcement-deepread`；本技能专攻**再融资条款表**（规模、价格机制、锁定期、用途），并声明无历史折价数据库。

## 能力声明（开篇强制横幅）

> **not-feasible-now**：本地**无历史再融资折价数据库**。不得假装「历史上平均折价 X%」。仅从公告/原文抽取本次条款。

## 分析架构（投研方法）

- **问题/假设**：发行规模、价格机制、锁定期、用途是什么？
- **证据清单**：公告与 browser 原文
- **事实 | 假设 | 推断** 分栏

## 数据维度

| 维度 | 取数方向 | 缺失时 |
|------|----------|--------|
| 公告 | `get_instrument_notices` / `get_notice_content` | browser；仍无则中止 |
| 原文 | `browser_navigate` / `browser_snapshot` | 仅用公告文本 |
| 资讯 | `list_news_articles` | 线索须核实 |
| 交付 | `list_web_vendor` → `create_web` | 可跳过口头要点 |

## 步骤

1. **开篇横幅**（无历史折价库）。
2. **抽取条款表**（规模、价格、对象、锁定期、用途）。
3. **稀释/影响仅为推断**；交付网页。

## 网页报告建议目录

1. 能力声明横幅
2. 本次再融资条款表
3. 时间表与先决条件
4. 影响推断（分栏）
5. 缺口
6. 免责声明

## 禁止

- 伪造历史折价分布或「常规定价」
- 荐股；**禁止无交付就结束**
