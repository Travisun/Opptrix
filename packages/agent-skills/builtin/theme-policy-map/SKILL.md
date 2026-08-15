---
name: theme-policy-map
description: 主题政策地图工作流。用户说「政策主题」「主题投资」「政策映射」「/theme-policy-map」时使用。与 industry-chain 区分：本技能是政策主题地图，非产业链上下游。默认 create_web。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: 主题政策地图
  summary: 政策主题与相关标的/板块映射
  category: cn-market
  slash-rank: "320"
  default-deliverable: web
  required-packs: market industry news artifacts
allowed-tools: list_news_articles get_news_article get_instrument_notices get_sector_list get_sector_constituents search_instruments get_market_dynamics ask_user create_web update_web read_web list_web_vendor
---

# 主题政策地图

## 何时使用

用户要把**政策/主题叙事**映射到相关板块与标的观察名单。

**vs `@skill:industry-chain`**：产业链技能画**上下游结构**；本技能画**政策主题 → 板块/标的**映射，不替代产业链节点图。

## 分析架构（投研方法）

- **问题/假设**：政策文本提到的方向对应哪些可观察板块/标的？
- **证据清单**：资讯/公告、板块列表与成分、市场动态
- **多维交叉验证**：政策表述 vs 板块涨跌；主题热度 vs 基本面（若有）
- **事实 | 假设 | 推断** 分栏：政策原文为事实；映射关系多为假设/推断

## 数据维度

| 维度 | 取数方向 | 缺失时 |
|------|----------|--------|
| 主题确认 | `ask_user` | 先确认政策文本/主题名 |
| 资讯公告 | `list_news_articles` / `get_news_article` / `get_instrument_notices` | 标明无来源则拒绝编造 |
| 板块 | `get_sector_list` / `get_sector_constituents` | 用用户清单 |
| 市场 | `get_market_dynamics` | 可省略 |
| 交付 | `list_web_vendor` → `create_web` | 可跳过口头要点 |

## 步骤

1. **确认主题与政策来源**（须可引用）。
2. **抽取政策要点** → **映射板块/标的**（映射标为假设）。
3. **对照市场表现**；与产业链技能分工写清。
4. **交付网页（默认）**：地图/表；见 `@skill:create-web`。

## 网页报告建议目录

1. 主题、来源与和产业链的分工说明
2. 政策要点（引用）
3. 主题 → 板块/标的映射表
4. 市场对照
5. 事实 / 假设 / 推断分栏
6. 免责声明

## 禁止

- 无来源编造「国家已定调XX」
- 把映射名单写成荐股池
- 用产业链上下游图冒充本技能交付
- **禁止无交付就结束**
