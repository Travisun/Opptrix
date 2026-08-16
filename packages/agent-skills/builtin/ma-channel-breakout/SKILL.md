---
name: ma-channel-breakout
description: 均线交叉结合通道突破择时。用户说「均线通道突破」「金叉后突破」「均线交叉通道」「/ma-channel-breakout」时使用。方法溯源申万宏源研报逻辑重写；日K经 workspace JSON。默认 create_web。禁止脚本内取数。易混 lean-ma-cross-trend（勿合并）。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: 均线通道突破
  summary: 双均线交叉结合通道突破的择时状态解读
  category: quant
  slash-rank: "434"
  default-deliverable: web
  required-packs: instrument_analytics artifacts
allowed-tools: search_instruments get_instrument_snapshot get_instrument_chart ask_user opptrix_run workspace_write workspace_read create_web update_web read_web list_web_vendor
---

# 均线交叉 + 通道突破

方法溯源 **申万宏源《均线交叉结合通道突破择时研究》**：金叉后近 N 日创新高开仓，死叉后近 N 日跌破低点平仓。

## 何时使用

用户要把 **双均线交叉** 与 **价格通道突破** 结合做择时状态解读。

边界：易混 `@skill:lean-ma-cross-trend`、`@skill:lean-vix-dual-thrust`（勿合并）。

## 分析架构

- **问题**：是否处于「交叉确认 + 通道突破」持仓？
- **证据**：日收盘；短/长均线；通道窗口 N
- **模式**：`params.mode=channel`（默认）或 `cross`（纯交叉）

## 数据维度

| 维度 | 取数方向 | 缺失时 |
|------|----------|--------|
| 标的 | `search_instruments` | 先确认 |
| 日 K | `get_instrument_chart` → `workspace_write` | — |
| 计算 | `opptrix_run` | — |
| 交付 | `create_web` | — |

## 步骤

1. 确认 `short/long/channel_n/method`（SMA/EMA/WMA）。
2. 写入日 K。
3. `python scripts/ma_channel_breakout.py --input data.json --output result.json`
4. 解读持仓 `signal`（1/0）。
5. `create_web`。

## 依赖

- 纯 Python；无 talib。

## 禁止

- 荐股；把信号写成买卖指令
- 脚本内联网取数（jqdata / tushare / qlib / HTTP 行情）
- 假装完整回测引擎或伪造胜率
- 无交付就结束（默认 web）
- 与 `lean-*` 技能合并或冒充

