---
name: closing-market-brief
description: 收盘报告工作流。用户说「收盘报告」「收盘复盘」「尾盘总结」「今天收盘怎么样」时使用。汇总指数、涨跌停、龙虎榜与市场全景；默认用 create_web 交付可预览 HTML 报告页。
license: Apache-2.0
metadata:
  author: opptrix
  version: "2.0"
  title: 收盘
  summary: 收盘复盘：指数、涨跌停与资金面
  category: market
  slash-rank: "20"
  default-deliverable: web
  required-packs: market artifacts
allowed-tools: get_market_dynamics get_market_session get_limit_updown get_dragon_tiger get_market_sentiment get_cn_market_special create_web update_web read_web list_web_vendor create_canvas create_mindmap
---

# 收盘报告

## 何时使用

用户要一份**收盘后**的市场复盘（不是盘前早报，也不是个股深度分析）。默认交付**可预览网页报告**。

## 分析架构（投研方法）

- **问题/假设**：今日收盘主线与风险偏好如何变化？涨跌停与龙虎榜是否验证热点？
- **证据清单**：指数与成交、涨跌分布、涨跌停池、龙虎榜、情绪指标
- **多维交叉验证**：指数涨跌 vs 涨跌停家数；题材热度 vs 龙虎榜上榜结构
- **结论与不确定**：收盘一句话；标注盘中扰动、数据源覆盖不全
- **风险与缺口**：未收盘、缺涨跌停/龙虎榜时写明
- **事实与推断必须分开**：家数与涨跌幅为事实；「资金抱团/情绪过热」为推断

## 数据维度

| 维度 | 取数方向 | 缺失时 |
|------|----------|--------|
| 时段确认 | `get_market_session` | 盘中则降级为实时全景并说明 |
| 市场全景 | `get_market_dynamics` | 禁止编造指数/成交 |
| 涨跌停池 | `get_limit_updown` | notes 说明；勿虚构连板 |
| 龙虎榜 | `get_dragon_tiger`（可选） | 跳过栏目并说明 |
| 情绪 | `get_market_sentiment` | 省略情绪章 |
| 专题 | `get_cn_market_special`（须 kind，可选） | 跳过 |
| 交付 | `list_web_vendor` → `create_web` | 用户只要口头要点时可跳过 |

## 步骤

1. **确认范围**：已收盘则完整复盘；盘中说明并降级。
2. **按维度取数**：全景 → 涨跌停 → 按需龙虎榜/情绪/专题。
3. **交叉验证与结构化结论**：主线、强弱、资金博弈要点；事实/推断分栏。
4. **交付网页（默认）**：`list_web_vendor` → `create_web` 完整 HTML；已有则 `read_web` / `update_web`。
5. **备选**：用户点名画布用 `create_canvas`；只要结构图用 `create_mindmap`。

## 网页报告建议目录

1. 报告头：日期、收盘一句话  
2. 指数与成交（表/图）  
3. 涨跌分布与情绪  
4. 涨跌停池与连板高度  
5. 龙虎榜要点（若有）  
6. 今日主线与观察（推断标注）  
7. 数据说明与免责声明

## 禁止

- 荐股 / 编造涨跌停或龙虎榜  
- **禁止无交付就结束**（默认须有 web 产物，除非用户明确只要口头要点）  
- 与早报混淆：本技能含涨跌停与龙虎榜复盘
