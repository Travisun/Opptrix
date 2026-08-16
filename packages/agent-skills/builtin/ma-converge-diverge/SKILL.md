---
name: ma-converge-diverge
description: 均线收敛与发散因子。用户说「均线收敛」「均线发散」「形态识别均线」「开源证券91」「/ma-converge-diverge」时使用。方法溯源开源证券量化评论91；日收盘经 workspace JSON。默认 create_web。禁止脚本内取数。易混 lean-ma-cross-trend（勿合并）。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: 均线收敛发散
  summary: 多均线收敛发散形态因子与状态解读
  category: quant
  slash-rank: "435"
  default-deliverable: web
  required-packs: instrument_analytics artifacts
allowed-tools: search_instruments get_instrument_snapshot get_instrument_chart ask_user opptrix_run workspace_write workspace_read create_web update_web read_web list_web_vendor
---

# 均线收敛与发散

方法溯源 **开源证券量化评论（91）**：对价格与多条均线做截面标准差，因子 `−log(1+std)`，值越大越收敛。

## 何时使用

用户要识别 **多均线收敛/发散** 形态，并作因子/状态解读（选股或择时辅助）。

边界：易混 `@skill:lean-ma-cross-trend`、`@skill:lean-ema-cross-universe`（勿合并）。

## 分析架构

- **问题**：均线束是在收敛还是发散？
- **证据**：日收盘；窗口列表（默认 5/10/20/60）
- **信号**：`delta`（因子差分）或 `zscore` 模式

## 数据维度

| 维度 | 取数方向 | 缺失时 |
|------|----------|--------|
| 标的/宇宙 | `search_instruments` | 先确认 |
| 日 K | `get_instrument_chart` / batch → `workspace_write` | — |
| 计算 | `opptrix_run` | — |
| 交付 | `create_web` | — |

## 步骤

1. 确认 `params.windows` 与 `signal_mode`。
2. 写入日 K（单标的主路径；多标的可分次跑）。
3. `python scripts/ma_converge_diverge.py --input data.json --output result.json`
4. 解读 `series.convergence_factor`（越大越收敛）与 `signal`。
5. `create_web`。

## 依赖

- 纯 Python 标准库。

## 禁止

- 荐股；把信号写成买卖指令
- 脚本内联网取数（jqdata / tushare / qlib / HTTP 行情）
- 假装完整回测引擎或伪造胜率
- 无交付就结束（默认 web）
- 与 `lean-*` 技能合并或冒充

