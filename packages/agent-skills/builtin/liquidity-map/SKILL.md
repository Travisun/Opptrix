---
name: liquidity-map
description: 流动性地图工作流。用户说「流动性」「资金流向」「龙虎榜热力」「money flow」「/liquidity-map」时使用。money_flow/dragon_tiger 等；声明无 L2。默认 create_web。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: 流动性地图
  summary: 资金流与龙虎榜流动性热力
  category: macro
  slash-rank: "305"
  default-deliverable: web
  required-packs: market artifacts
allowed-tools: get_instrument_money_flow get_dragon_tiger get_market_dynamics get_cn_market_special get_limit_updown search_instruments ask_user create_web update_web read_web list_web_vendor
---

# 流动性地图

## 何时使用

用户要看**资金流向/龙虎榜/涨跌停相关的流动性热力**，而非 L2 盘口深度。边界：vs `@skill:northbound-flow`——北向/互联互通专用口径与字段探测；本技能覆盖**个股/板块资金流与龙虎榜热力**。**重申：无 Level-2**，不可假装十档盘口或微观结构深度曲线。

**能力声明**：无 Level-2 十档盘口；不可假装微观结构流动性曲线。

## 分析架构（投研方法）

- **问题/假设**：资金向哪些方向聚集？龙虎榜席位是否异常？
- **证据清单**：`get_instrument_money_flow`、`get_dragon_tiger`、市场动态/涨跌停
- **多维交叉验证**：个股资金流 vs 板块/涨停生态
- **事实 | 假设 | 推断** 分栏

## 数据维度

| 维度 | 取数方向 | 缺失时 |
|------|----------|--------|
| 标的/范围 | `ask_user` / `search_instruments` | 先确认 |
| 资金流 | `get_instrument_money_flow` | 省略资金章 |
| 龙虎榜 | `get_dragon_tiger` | 标明无榜单 |
| 市场特殊/涨跌停 | `get_cn_market_special` / `get_limit_updown` | 可降级 |
| 动态 | `get_market_dynamics` | 可省略 |
| 交付 | `list_web_vendor` → `create_web` | 可跳过口头要点 |

## 步骤

1. **确认范围**（个股/板块/全日热力）。
2. **取资金流与龙虎榜**等；开篇声明无 L2。
3. **热力表/图** + 分栏结论。
4. **交付网页（默认）**。

## 网页报告建议目录

1. 范围、时效与无 L2 声明
2. 资金流向摘要
3. 龙虎榜/涨跌停相关流动性
4. 交叉验证（事实 / 推断）
5. 风险与缺口
6. 免责声明

## 禁止

- 编造主力意图或 L2 盘口
- 荐股；「明日资金必流入」
- **禁止无交付就结束**
