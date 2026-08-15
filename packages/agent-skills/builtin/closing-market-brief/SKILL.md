---
name: closing-market-brief
description: 收盘报告工作流技能。用户说「收盘报告」「收盘复盘」「尾盘总结」「今天收盘怎么样」时使用。按固定栏目汇总指数、涨跌停、龙虎榜与市场全景，输出结构化 JSON。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
allowed-tools: get_market_dynamics get_limit_updown get_dragon_tiger get_market_sentiment
---

# 收盘报告

## 何时使用

用户要一份**收盘后**的市场复盘速览（不是盘前早报，也不是个股深度分析）。

## 步骤

1. **确认时段**：用会话时钟或 `get_market_session` 确认已收盘；盘中请求时说明并降级为实时全景。
2. **市场全景**：用 `get_market_dynamics` 拉取指数、涨跌分布、龙虎榜摘要等全景；一次调用即可。
3. **涨跌停池**：用 `get_limit_updown` 取当日涨停/跌停列表，统计数量与连板高度。
4. **龙虎榜明细（可选）**：若用户关注资金博弈，用 `get_dragon_tiger` 取上榜个股；数据缺失时说明。
5. **特殊专题（可选）**：若需连板天梯、飙升榜等同花顺独有数据，用 `get_cn_market_special`（须 kind）。
6. **输出 JSON**：按下方 Schema 输出，事实导向，不做买卖建议。

## 输出 JSON Schema

```json
{
  "report_type": "closing",
  "title": "string — 报告标题，如「2026-08-03 收盘报告」",
  "date": "string — YYYY-MM-DD",
  "summary": "string — 今日收盘一句话",
  "sections": [
    {
      "title": "string — 栏目标题",
      "content": "string — 栏目内容"
    }
  ],
  "indices": [
    {
      "name": "string — 指数名",
      "change_pct": "number | null — 涨跌幅 %",
      "amount": "string | null — 成交额（亿元）"
    }
  ],
  "limit_up": {
    "count": "number — 涨停数量",
    "highlights": ["string — 连板高度或代表个股"]
  },
  "limit_down": {
    "count": "number — 跌停数量"
  },
  "notes": ["string — 免事项：数据缺口等"]
}
```

## 注意

- 收盘报告以**事实汇总**为主，不做买卖建议。
- 涨跌停与龙虎榜数据缺失时在 `notes` 说明，禁止编造。
- 与早报区分：本技能聚焦收盘复盘，含涨跌停池与龙虎榜明细。
