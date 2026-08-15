---
name: news-digest
description: 资讯 / 公告摘要工作流（工具 list_news_articles / get_news_article / get_instrument_notices）。用户说「新闻」「资讯」「公告」「消息摘要」「今天有什么新闻」「读一下公告」「list_news_articles」「/news-digest」时使用。筛选要点并结构化摘要，不做买卖建议。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  required-packs: news
allowed-tools: list_news_articles get_news_article get_instrument_notices
---

# 资讯 / 公告摘要

## 何时使用

用户要**近期资讯或个股公告的要点摘要**，而不是完整个股尽调或市场早报栏目全集。

## 步骤

1. **确认范围**：全市场 / 某主题 / 某标的；不清时简短确认。
2. **浏览列表**：`list_news_articles`；个股公告用 `get_instrument_notices`。
3. **深读要点**：对关键条目 `get_news_article`；选 3–8 条，勿堆砌无关长文。
4. **结构化输出**：时间线要点 → 与标的/主题的相关性（推断须标注）→ 信息缺口。
5. **输出边界**：**不给出**买卖建议；勿把传闻写成已确认事实。

## 禁止

- 荐股或编造未返回的标题/正文
- 用早报技能冒充本技能（全市场开市简报应转 `` `@skill:morning-market-brief` ``）
