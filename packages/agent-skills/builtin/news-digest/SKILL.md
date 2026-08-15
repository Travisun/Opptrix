---
name: news-digest
description: 资讯 / 公告摘要工作流（list_news_articles / get_news_article / get_instrument_notices）。用户说「新闻」「资讯」「公告」「消息摘要」「今天有什么新闻」「读一下公告」「/news-digest」时使用。筛选要点并结构化摘要；默认用 create_web 交付可预览 HTML 摘要页。
license: Apache-2.0
metadata:
  author: opptrix
  version: "2.0"
  title: 资讯摘要
  summary: 把新闻与公告提炼成可读要点
  category: market
  slash-rank: "30"
  default-deliverable: web
  required-packs: news artifacts
allowed-tools: list_news_articles get_news_article get_instrument_notices create_web update_web read_web list_web_vendor create_canvas create_mindmap
---

# 资讯 / 公告摘要

## 何时使用

用户要**近期资讯或个股公告的要点摘要**（不是完整个股尽调，也不是市场早报栏目全集）。默认交付**可预览网页**。

## 分析架构（投研方法）

- **问题/假设**：哪些信息可能影响指定标的/主题的预期？
- **证据清单**：资讯列表、正文要点、个股公告原文可核对字段
- **多维交叉验证**：多源标题是否互相印证；公告事实 vs 媒体转述
- **结论与不确定**：按重要性排序；传闻与未证实信息单独标注
- **风险与缺口**：缺正文、付费墙、延迟
- **事实与推断必须分开**：标题/披露日期为事实；「利好/利空」为推断

## 数据维度

| 维度 | 取数方向 | 缺失时 |
|------|----------|--------|
| 资讯列表 | `list_news_articles` | 说明无可用条目 |
| 正文深读 | `get_news_article`（关键 3–8 条） | 仅保留标题级摘要 |
| 个股公告 | `get_instrument_notices` | 跳过公告章 |
| 交付 | `list_web_vendor` → `create_web` | 用户明确只要口头要点时可跳过 |

## 步骤

1. **确认范围**：全市场 / 主题 / 标的。
2. **按维度取数**：列表 → 深读关键条 → 按需公告。
3. **交叉验证与结构化结论**：时间线 + 相关性（推断标注）+ 信息缺口。
4. **交付网页（默认）**：`list_web_vendor` → `create_web`；已有则 `read_web` / `update_web`。
5. **备选**：用户点名画布 / 结构图时改用对应工具。

## 网页报告建议目录

1. 范围与时间窗  
2. 要点时间线（3–8 条）  
3. 与标的/主题的相关性（推断标注）  
4. 待核实与信息缺口  
5. 免责声明（无荐股）

## 禁止

- 荐股；把传闻写成已确认事实  
- **禁止无交付就结束**（默认须有 web 产物，除非用户明确只要口头要点）  
- 用早报技能冒充本技能（全市场开市简报转 `@skill:morning-market-brief`）
