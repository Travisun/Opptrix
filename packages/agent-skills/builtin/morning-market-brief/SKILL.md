---
name: morning-market-brief
description: 早报工作流技能。用户说「早报」「开市简报」「盘前速览」「今天市场怎么样」「开盘前帮我看看」时使用。按固定栏目汇总市场环境、热点与关注列表要点，输出结构化 JSON。
license: Apache-2.0
metadata:
  author: opptrix
  version: "2.0"
allowed-tools: get_market_dynamics get_market_session list_news_articles get_watchlist
---

# 早报 / 开市简报

## 何时使用

用户要一份**开市前或早盘**的简明市场速览（不是个股深度报告，也不是收盘复盘）。

## 步骤

1. **确认时钟与时段**：用会话时钟或 `get_market_session` 判断是否交易日、是否已开盘；非交易日说明并停止。
2. **市场全景**：用 `get_market_dynamics` 拉取指数、涨跌分布、情绪摘要等市场全景；一次调用即可。
3. **关注列表速览（可选）**：若用户有关注列表，用 `get_watchlist` 取列表，再用 `get_instrument_quotes` 批量取最新价与涨跌；无则跳过并说明。
4. **资讯要点**：用 `list_news_articles` 浏览近期重要资讯标题，选 3–5 条与今日相关的；勿展开无关长文。
5. **输出 JSON**：按下方 Schema 输出，保持简短、事实导向，不做买卖建议。

## 输出 JSON Schema

```json
{
  "report_type": "morning",
  "title": "string — 报告标题，如「2026-08-03 早报」",
  "date": "string — YYYY-MM-DD",
  "summary": "string — 今日环境一句话",
  "sections": [
    {
      "title": "string — 栏目标题",
      "content": "string — 栏目内容（要点列表或一句话）"
    }
  ],
  "indices": [
    {
      "name": "string — 指数名",
      "change_pct": "number | null — 涨跌幅 %"
    }
  ],
  "notes": ["string — 免事项：数据缺口、休市等"]
}
```

## 注意

- 早报以**事实汇总**为主，不做买卖建议。
- 数据缺失时在 `notes` 中说明，禁止编造数字。
- 与收盘报告区分：本技能聚焦盘前/早盘，不含涨跌停池与龙虎榜明细。
