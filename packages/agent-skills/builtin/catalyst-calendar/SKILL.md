---
name: catalyst-calendar
description: 催化日历工作流。用户说「催化」「事件日历」「财报日」「股东大会」「/catalyst-calendar」时使用。notices + trade_calendar 拼日程；无结构化催化剂库。默认 create_web。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: 催化日历
  summary: 公告与交易日历拼出的事件日程
  category: cn-market
  slash-rank: "310"
  default-deliverable: web
  required-packs: news market artifacts
allowed-tools: get_instrument_notices get_notice_content get_trade_calendar search_instruments list_news_articles ask_user create_web update_web read_web list_web_vendor
---

# 催化日历

## 何时使用

用户要**即将/近期事件日程**（财报、股东会、重要公告节点），而非完整主题政策地图。边界：vs `@skill:theme-policy-map`——政策主题→板块映射；本技能是**时间轴事件表**。单则公告条款精读用 `@skill:announcement-deepread`，不要用日历技能替代精读。

**能力声明**：本地**无结构化催化剂库**；日程由公告与交易日历拼出，可能不全。

## 分析架构（投研方法）

- **问题/假设**：未来窗口内有哪些可核实的披露/交易日节点？
- **证据清单**：`get_instrument_notices`、`get_notice_content`、`get_trade_calendar`、可选资讯
- **多维交叉验证**：公告日 vs 交易日；标题 vs 正文要点
- **事实 | 假设 | 推断** 分栏：日程条目为事实（有来源）；影响评估为推断

## 数据维度

| 维度 | 取数方向 | 缺失时 |
|------|----------|--------|
| 标的 | `search_instruments` / `ask_user` | 先确认 |
| 公告 | `get_instrument_notices` / `get_notice_content` | 标明无公告 |
| 交易日历 | `get_trade_calendar` | 用自然日并标注 |
| 资讯 | `list_news_articles` | 可省略 |
| 交付 | `list_web_vendor` → `create_web` | 可跳过口头要点 |

## 步骤

1. **确认标的与时间窗**。
2. **拉公告 + 交易日历**；声明无结构化催化剂库。
3. **拼日历表**（日期、事件、来源链接/标题）。
4. **交付网页（默认）**。

## 网页报告建议目录

1. 窗口、标的与能力声明
2. 催化/事件日历表
3. 关键公告摘要（带来源）
4. 影响推断（分栏）
5. 缺口（可能遗漏未披露事项）
6. 免责声明

## 禁止

- 编造未出现在公告/资讯中的「确定催化剂」
- 荐股或「事件驱动必涨」
- **禁止无交付就结束**
