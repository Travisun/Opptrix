---
name: precedent-tx
description: 先例交易工作流。用户说「先例交易」「comparable transactions」「并购先例」「/precedent-tx」时使用。not-feasible-now：本地无先例交易库；仅用户表/browser；无来源行拒绝。默认 create_web。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: 先例交易
  summary: 用户表/网页来源的先例交易对照
  category: event
  slash-rank: "350"
  default-deliverable: web
  required-packs: browser news workspace artifacts
allowed-tools: ask_user browser_navigate browser_snapshot list_news_articles get_news_article workspace_read workspace_write create_web update_web read_web list_web_vendor
---

# 先例交易

## 何时使用

用户要做**并购/融资先例交易对照**。边界：具体并购/重组**公告条款解读**用 `@skill:mna-event`；本技能只整理**带来源的先例样本表**（本地无先例库，禁止编造倍数）。

## 能力声明（开篇强制横幅）

报告与回答开篇必须出现：

> **本地无先例交易库（not-feasible-now）**：Opptrix 未内置先例交易数据库。本技能仅整理**用户提供的表格**或 **browser/资讯中带来源的行**。无来源的先例行一律拒绝写入。

## 分析架构（投研方法）

- **问题/假设**：在可比交易样本下，对价/倍数处于何区间？
- **证据清单**：用户表、browser 抓取、资讯（均须来源）
- **事实 | 假设 | 推断** 分栏

## 数据维度

| 维度 | 取数方向 | 缺失时 |
|------|----------|--------|
| 用户样本 | `ask_user` / `workspace_read` | 无表则只给收集模板 |
| 网页来源 | `browser_navigate` / `browser_snapshot` | 无来源行删除 |
| 资讯线索 | `list_news_articles` / `get_news_article` | 须回原链核实 |
| 固化 | `workspace_write` | 可选 |
| 交付 | `list_web_vendor` → `create_web` | 可跳过口头要点 |

## 步骤

1. **开篇横幅**：本地无先例交易库。
2. **收集带来源的行**；无来源 → 拒绝。
3. **制表与区间描述**（非目标价）；交付网页。

## 网页报告建议目录

1. 能力声明横幅（无先例库）
2. 样本来源与纳入标准
3. 先例交易表（来源列必填）
4. 描述统计（若样本足够）
5. 事实 / 假设 / 推断
6. 免责声明

## 禁止

- 伪造先例库或无来源「市场平均溢价」
- 荐股；**禁止无交付就结束**
- 无来源行不得写入报告
