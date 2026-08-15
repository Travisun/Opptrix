---
name: macro-brief
description: 宏观简报工作流。用户说「宏观」「利率」「社融」「市场体制」「risk on」「/macro-brief」时使用。串联宏观序列、市场体制、动态与情绪；默认 create_web 交付。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: 宏观简报
  summary: 宏观序列与市场体制/情绪摘要
  category: macro
  slash-rank: "290"
  default-deliverable: web
  required-packs: market news artifacts
allowed-tools: get_macro_series get_market_regime get_market_dynamics get_market_sentiment list_news_articles get_news_article create_web update_web read_web list_web_vendor
---

# 宏观简报

## 何时使用

用户要一份**宏观与市场体制对照简报**（非单只个股、非风格轮动专题）。边界：风格/板块轮动用 `@skill:style-rotation`；跨资产对照用 `@skill:cross-asset`。

## 分析架构（投研方法）

- **问题/假设**：当前宏观与市场状态如何相互印证或冲突？
- **证据清单**：`get_macro_series`、`get_market_regime`、`get_market_dynamics`、`get_market_sentiment`、可选资讯
- **多维交叉验证**：宏观方向 vs 情绪/广度；体制标签 vs 动态事实
- **结论与不确定**：体制标签为模型输出事实；路径推演为推断
- **事实 | 假设 | 推断** 分栏

## 数据维度

| 维度 | 取数方向 | 缺失时 |
|------|----------|--------|
| 宏观序列 | `get_macro_series` | 跳过该序列并标明 |
| 市场体制 | `get_market_regime` | 省略体制章 |
| 市场动态 | `get_market_dynamics` | 用情绪/资讯降级 |
| 情绪 | `get_market_sentiment` | 标明无情绪数据 |
| 资讯背景 | `list_news_articles` / `get_news_article` | 可省略 |
| 交付 | `list_web_vendor` → `create_web` | 可跳过口头要点 |

## 步骤

1. **确认关注点**（利率/增长/风险偏好/区域）。
2. **并行取数**：宏观序列 + regime + dynamics + sentiment。
3. **交叉验证**与分栏结论。
4. **交付网页（默认）**：见 `@skill:create-web`。

## 网页报告建议目录

1. 简报范围与数据时效
2. 宏观序列要点
3. 市场体制与动态
4. 情绪与资讯对照
5. 交叉结论（事实 / 推断）
6. 风险与缺口
7. 免责声明

## 禁止

- 荐股；编造宏观点位或「央行必将…」
- **禁止无交付就结束**
