---
name: northbound-flow
description: 北向资金工作流。用户说「北向」「沪股通」「深股通」「外资流入」「/northbound-flow」时使用。先字段可用性探测；禁止编造北向净买。默认 create_web。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: 北向资金
  summary: 北向/互联互通资金字段探测与摘要
  category: cn-market
  slash-rank: "315"
  default-deliverable: web
  required-packs: market artifacts
allowed-tools: get_cn_market_special get_market_dynamics get_instrument_money_flow get_instrument_snapshot ask_user create_web update_web read_web list_web_vendor
---

# 北向资金

## 何时使用

用户要**北向/互联互通资金**观察。必须先做**字段可用性探测**：工具未返回北向净买等字段时，**禁止编造**，改为说明缺口并降级到可得的资金/市场动态。边界：vs `@skill:liquidity-map`——后者做个股/板块资金流与龙虎榜热力（非 L2）；本技能专盯**沪深股通/北向口径**；全市场开市简报用 `@skill:morning-market-brief`。

## 分析架构（投研方法）

- **问题/假设**：北向资金近期方向如何？与标的/市场是否同向？
- **证据清单**：`get_cn_market_special`、`get_market_dynamics`、可选个股资金流
- **多维交叉验证**：北向字段 vs 大盘动态；个股资金流≠北向
- **事实 | 假设 | 推断** 分栏

## 数据维度

| 维度 | 取数方向 | 缺失时 |
|------|----------|--------|
| 市场特殊/北向 | `get_cn_market_special` | **诚实缺口**：写「未返回北向字段」，禁止编造 |
| 市场动态 | `get_market_dynamics` | 降级说明 |
| 个股资金 | `get_instrument_money_flow` | 标明≠北向 |
| 快照 | `get_instrument_snapshot` | 可省略 |
| 交付 | `list_web_vendor` → `create_web` | 可跳过口头要点 |

## 步骤

1. **探测** `get_cn_market_special` 等是否含北向相关字段。
2. **有则制表，无则横幅声明缺口**——绝不编造净买额。
3. **可选**对照大盘动态/个股资金（须标注口径不同）。
4. **交付网页（默认）**。

## 网页报告建议目录

1. 数据可用性声明
2. 北向/互联互通事实表（或缺口说明）
3. 口径说明（字段定义与统计窗口）
4. 与个股资金流差异（≠主力/龙虎榜口径）
5. 市场对照与事实 / 推断分栏
6. 免责声明

## 禁止

- **禁止编造北向净买入/净卖出数字**
- 把个股主力资金流写成北向
- 荐股；**禁止无交付就结束**
