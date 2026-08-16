---
name: low-lag-trendline
description: 低延迟趋势线（LLT）择时。用户说「低延迟趋势线」「LLT」「低滞后均线」「/low-lag-trendline」时使用。方法溯源广发证券 LLT；用日收盘经 workspace JSON 计算。默认 create_web。禁止脚本内取数。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: 低延迟趋势线
  summary: LLT低延迟趋势线斜率择时状态解读
  category: quant
  slash-rank: "433"
  default-deliverable: web
  required-packs: instrument_analytics artifacts
allowed-tools: search_instruments get_instrument_snapshot get_instrument_chart ask_user opptrix_run workspace_write workspace_read create_web update_web read_web list_web_vendor
---

# 低延迟趋势线择时

方法溯源 **广发证券低延迟趋势线（LLT）**；用收盘价递推 LLT，并以滚动斜率比生成多头开关信号。

## 何时使用

用户要降低均线滞后、用 LLT 判断趋势是否仍向上。

## 分析架构

- **问题**：LLT 斜率是否向上？
- **证据**：日收盘；参数 `d`/`alpha`、`slope_window`
- **信号**：斜率比 >1 → 持仓 1，否则 0（默认不做空）

## 数据维度

| 维度 | 取数方向 | 缺失时 |
|------|----------|--------|
| 标的 | `search_instruments` | 先确认 |
| 日 K | `get_instrument_chart` → `workspace_write` | — |
| 计算 | `opptrix_run` | — |
| 交付 | `create_web` | — |

## 步骤

1. 确认 `params.d`（默认 20）或 `alpha`。
2. 写入日 K JSON。
3. `python scripts/low_lag_trendline.py --input data.json --output result.json`
4. 解读 `series.llt` 与 `signal`。
5. `create_web`。

## 依赖

- 纯 Python 标准库。

## 禁止

- 荐股；把信号写成买卖指令
- 脚本内联网取数（jqdata / tushare / qlib / HTTP 行情）
- 假装完整回测引擎或伪造胜率
- 无交付就结束（默认 web）
- 与 `lean-*` 技能合并或冒充

