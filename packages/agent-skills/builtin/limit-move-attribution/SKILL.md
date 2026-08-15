---
name: limit-move-attribution
description: 涨跌停归因工作流。用户说「涨停原因」「跌停」「连板」「龙虎榜归因」「/limit-move-attribution」时使用。get_limit_updown / get_cn_market_special / get_dragon_tiger；禁止明日连板名单。默认 create_web。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: 涨跌停归因
  summary: 涨跌停与龙虎榜事实归因
  category: cn-market
  slash-rank: "325"
  default-deliverable: web
  required-packs: market news artifacts
allowed-tools: get_limit_updown get_cn_market_special get_dragon_tiger list_news_articles get_instrument_notices search_instruments ask_user create_web update_web read_web list_web_vendor
---

# 涨跌停归因

## 何时使用

用户要理解**当日/近期涨跌停**的可核实归因（榜单、公告、资讯），而非预测明日连板。边界：资讯标题流用 `@skill:news-digest`；单则公告条款精读用 `@skill:announcement-deepread`。本技能把榜单/龙虎榜与披露**交叉归因**，禁止输出连板预测名单。

## 分析架构（投研方法）

- **问题/假设**：涨跌停更可能由什么可观察因素驱动？
- **证据清单**：`get_limit_updown`、`get_cn_market_special`、`get_dragon_tiger`、公告/资讯
- **多维交叉验证**：榜单席位 vs 公告时间；板块涨停数 vs 个股
- **事实 | 假设 | 推断** 分栏

## 数据维度

| 维度 | 取数方向 | 缺失时 |
|------|----------|--------|
| 涨跌停 | `get_limit_updown` | 标明无数据 |
| 市场特殊 | `get_cn_market_special` | 降级 |
| 龙虎榜 | `get_dragon_tiger` | 省略席位章 |
| 公告/资讯 | `get_instrument_notices` / `list_news_articles` | 归因降为「未知」 |
| 交付 | `list_web_vendor` → `create_web` | 可跳过口头要点 |

## 步骤

1. **确认日期与标的/全市场**。
2. **拉涨跌停 + 龙虎榜 + 公告资讯**。
3. **归因表**：每条带来源；无来源写未知。
4. **交付网页（默认）**；**禁止输出明日连板名单**。

## 网页报告建议目录

1. 日期范围与样本
2. 涨跌停事实表
3. 龙虎榜与公告对照
4. 归因结论（事实 / 推断）
5. 缺口
6. 免责声明（禁止预测连板）

## 禁止

- **禁止「明日连板名单」或打板荐股**
- 编造涨停原因
- **禁止无交付就结束**
