---
name: morning-market-brief
description: 早报 / 开市简报工作流。用户说「早报」「开市简报」「盘前速览」「今天市场怎么样」「开盘前帮我看看」时使用。汇总市场环境、热点与关注列表要点；默认用 create_web 交付可预览 HTML 报告页（非 JSON 口头结束）。
license: Apache-2.0
metadata:
  author: opptrix
  version: "3.0"
  title: 早报
  summary: 盘前行情与关注要点，一页看清
  category: market
  slash-rank: "10"
  default-deliverable: web
  required-packs: market news portfolio artifacts
allowed-tools: get_market_dynamics get_market_session list_news_articles get_watchlist get_instrument_quotes create_web update_web read_web list_web_vendor create_canvas create_mindmap
---

# 早报 / 开市简报

## 何时使用

用户要一份**开市前或早盘**的市场速览（不是个股深度报告，也不是收盘复盘）。默认交付**可预览网页报告**。

## 分析架构（投研方法）

- **问题/假设**：今日开盘前市场风险偏好与主线是什么？关注列表是否有需优先关注的异动？
- **证据清单**：交易时段、指数与涨跌分布、情绪摘要、资讯标题、关注列表报价
- **多维交叉验证**：指数方向 vs 涨跌家数/情绪；资讯主题 vs 市场热点是否同向
- **结论与不确定**：用一句话概括「环境」；标注隔夜外盘、数据延迟等不确定因素
- **风险与缺口**：休市、缺指数、无关注列表等写入报告「数据说明」
- **事实与推断必须分开**：涨跌与成交额为事实；「情绪回暖/避险」须标为推断

## 数据维度

| 维度 | 取数方向 | 缺失时 |
|------|----------|--------|
| 交易时钟 | `get_market_session` / 会话时钟 | 说明无法确认时段；非交易日可停或降级 |
| 市场全景 | `get_market_dynamics`（指数、涨跌分布、情绪） | `notes` 写明缺口，禁止编造 |
| 关注列表 | `get_watchlist` + `get_instrument_quotes` | 无列表则跳过并说明 |
| 资讯要点 | `list_news_articles` 选 3–5 条相关标题 | 无资讯则空栏目并说明 |
| 交付载体 | `list_web_vendor` → `create_web` | 用户明确只要口头要点时可不建网页 |

## 步骤

1. **确认范围**：开市前/早盘；非交易日说明并停止或降级。
2. **按维度取数**：先时段，再 `get_market_dynamics`；可选关注列表报价与资讯。
3. **交叉验证与结构化结论**：环境一句话 + 栏目要点；事实/推断分栏。
4. **交付网页（默认）**：`list_web_vendor` → `create_web` 输出完整 HTML 报告页（章节清晰；指数表/涨跌分布可用本地 vendor 图表）。已有则 `read_web` / `update_web`。
5. **备选**：仅当用户点名「画布/一页式机构报告」用 `create_canvas`；只要「结构图」用 `create_mindmap`。

## 网页报告建议目录

1. 报告头：日期、时段、一句话环境摘要  
2. 指数与市场全景（表 + 可选图）  
3. 涨跌分布与情绪要点  
4. 关注列表速览（若有）  
5. 资讯要点（3–5 条）  
6. 结论：今日观察焦点（推断须标注）  
7. 数据说明与免责声明（无荐股）

## 禁止

- 荐股 / 编造数字或标题  
- **禁止无交付就结束**（默认必须有 web 产物，除非用户明确只要口头要点）  
- 用收盘涨跌停/龙虎榜流程冒充早报（应转 `@skill:closing-market-brief`）
