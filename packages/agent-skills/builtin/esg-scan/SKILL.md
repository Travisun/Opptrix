---
name: esg-scan
description: ESG 扫描工作流。用户说「ESG」「社会责任」「绿色」「争议事件」「/esg-scan」时使用。not-feasible-now：禁止伪造 ESG 分数；做议题/争议扫描。默认 create_web。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: ESG扫描
  summary: ESG 议题与争议扫描（无伪造分数）
  category: event
  slash-rank: "365"
  default-deliverable: web
  required-packs: news browser artifacts
allowed-tools: list_news_articles get_news_article get_instrument_notices browser_navigate browser_snapshot search_instruments ask_user create_web update_web read_web list_web_vendor
---

# ESG 扫描

## 何时使用

用户要做**ESG 相关议题与争议扫描**。边界：一般资讯标题流用 `@skill:news-digest`；单则公告条款精读用 `@skill:announcement-deepread`。本技能只整理**带来源的 E/S/G 议题表**，**禁止伪造 ESG 评分/等级**。

## 能力声明（开篇强制横幅）

> **not-feasible-now**：本地**无 ESG 评分库**。**禁止伪造** MSCI/标普/商道融绿等分数或等级。本技能只整理**带来源的议题与争议事件**。

## 分析架构（投研方法）

- **问题/假设**：近期有哪些可核实的 E/S/G 议题或争议？
- **证据清单**：资讯、公告、browser 原文
- **事实 | 假设 | 推断** 分栏

## 数据维度

| 维度 | 取数方向 | 缺失时 |
|------|----------|--------|
| 标的 | `search_instruments` / `ask_user` | 先确认 |
| 资讯公告 | `list_news_articles` / `get_news_article` / `get_instrument_notices` | 无来源则空态说明 |
| 原文 | `browser_navigate` / `browser_snapshot` | 仅用已有文本 |
| 交付 | `list_web_vendor` → `create_web` | 可跳过口头要点 |

## 步骤

1. **开篇横幅**（无 ESG 分数库）。
2. **扫描议题表**（主题、日期、来源、摘要）。
3. **禁止打分**；交付网页。

## 网页报告建议目录

1. 能力声明横幅
2. 议题/争议事件表（来源列）
3. 主题归类（E/S/G，假设性归类须标明）
4. 事实 / 推断分栏
5. 缺口
6. 免责声明

## 禁止

- **禁止伪造 ESG 分数或评级徽章**
- 无来源指控当作事实
- 荐股；**禁止无交付就结束**
