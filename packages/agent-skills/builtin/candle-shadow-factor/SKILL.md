---
name: candle-shadow-factor
description: 上下影线因子（东吴思路）。用户说「上下影线」「影线因子」「威廉影线」「UBL」「/candle-shadow-factor」时使用。基于 OHLCV 构造标准化上下影线因子序列。默认 A股。默认 create_web。禁止荐股。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: 上下影线因子
  summary: 蜡烛/威廉上下影线标准化因子
  category: quant
  slash-rank: "565"
  default-deliverable: web
  required-packs: instrument_analytics artifacts
allowed-tools: search_instruments get_instrument_snapshot get_instrument_chart batch_instrument_snapshots ask_user get_agent_skill_file opptrix_run workspace_write workspace_read create_web update_web read_web list_web_vendor
references:
  - scripts/candle_shadow_factor.py
  - scripts/fixtures/sample_bars.json
---

# 上下影线因子

溯源东吴「技术分析拥抱选股因子」上下影线系列：蜡烛图或威廉定义的上下影线，经近 5 日均值标准化，再对近 20 日取 mean/std；综合因子近似 `Upper_std + Williams_lower_mean`（**无市值中性**时须声明）。

## 何时使用

- 单标的时序影线因子，或小集合截面（bars 带 `symbol`）
- 需要 `factor` 序列 JSON 再网页解读

非目标：全 A 月度回测引擎；荐股排序当买卖单。

## 算法要点（事实）

| 模式 | 上影 | 下影 |
|------|------|------|
| `candle` | high − max(open,close) | min(open,close) − low |
| `williams`（默认） | high − close | close − low |

标准化：当日影线 / 过去 `norm_lookback`（默认 5）日影线均值。聚合：过去 `agg_lookback`（默认 20）日的 mean/std。

## 数据维度

| 维度 | 取数方向 | 缺失时 |
|------|----------|--------|
| 标的/宇宙 | `search_instruments` / `ask_user` | 先确认 |
| OHLCV | `get_instrument_chart` / `batch_instrument_snapshots` | 无法计算 |
| 模式参数 | `ask_user` | 默认 williams |
| 落盘 | `workspace_write` | 无法跑脚本 |
| 脚本 | `get_agent_skill_file` | 说明读出 |
| 计算 | `opptrix_run` | 标明失败 |
| 交付 | `create_web` | 可跳过口头 |

## 步骤

1. 确认标的与 `mode`（candle/williams）。
2. 取日 K OHLCV → `workspace_write`。
3. 准备 `scripts/candle_shadow_factor.py`。
4. `opptrix_run`：`python scripts/candle_shadow_factor.py --input … --output …`
5. 输出 `series.factor`；**禁止**据此点名「应买哪几只」。
6. 分栏结论 → 默认 `create_web`。

## 依赖

仅 Python 标准库。禁止联网取数。

## 禁止

- 荐股；把低因子值写成「强烈买入」
- 假装已做市值中性/行业中性（未做须写假设）
- 无交付结束（默认 web）
