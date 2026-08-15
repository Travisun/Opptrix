---
name: mna-event
description: 并购事件工作流。用户说「并购」「收购」「要约」「重组」「/mna-event」时使用。从公告抽取条款；无并购库/假先例。默认 create_web。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: 并购事件
  summary: 并购公告条款与影响框架
  category: event
  slash-rank: "340"
  default-deliverable: web
  required-packs: news fundamentals browser artifacts
allowed-tools: get_instrument_notices get_notice_content list_news_articles get_news_article get_instrument_profile get_instrument_financials browser_navigate browser_snapshot ask_user create_web update_web read_web list_web_vendor
---

# 并购事件

## 何时使用

用户要解读**具体并购/重组公告条款与影响框架**。无本地并购交易库；**禁止编造先例倍数**。先例对比请转 `@skill:precedent-tx`（诚实缺口）。

## 分析架构（投研方法）

- **问题/假设**：交易对价、支付方式、先决条件与时间表明什么？
- **证据清单**：公告正文、概况/财务、必要时 browser 原文
- **多维交叉验证**：标题摘要 vs 正文条款；对价 vs 财务体量
- **事实 | 假设 | 推断** 分栏

## 数据维度

| 维度 | 取数方向 | 缺失时 |
|------|----------|--------|
| 公告 | `get_instrument_notices` / `get_notice_content` | browser 原文；仍无则中止结论 |
| 资讯 | `list_news_articles` / `get_news_article` | 可作线索，须回公告核实 |
| 基本面 | `get_instrument_profile` / `get_instrument_financials` | 影响章从简 |
| 原文页 | `browser_navigate` / `browser_snapshot` | 仅用已有公告文本 |
| 交付 | `list_web_vendor` → `create_web` | 可跳过口头要点 |

## 步骤

1. **定位公告**并抽取条款表（对价、股份、条件、时间）。
2. **禁止假先例**；需要先例则引导 `@skill:precedent-tx`。
3. **影响框架**分栏；交付网页。

## 网页报告建议目录

1. 交易摘要与来源
2. 关键条款表
3. 双方概况（若可得）
4. 影响与不确定性（事实 / 推断）
5. 缺口（无并购库）
6. 免责声明

## 禁止

- 编造先例交易或「市场通常溢价XX%」无来源
- 荐股；**禁止无交付就结束**
