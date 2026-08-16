---
name: etf-intraday-momentum
description: ETF 日内动量（NoiseArea）。用户说「ETF日内动量」「噪声区域」「NoiseArea」「日内动量突破」「/etf-intraday-momentum」时使用。优先分钟K；仅有日K时脚本日频降级并在 meta.degraded 声明。默认 create_web。禁止脚本内取数。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: ETF日内动量
  summary: NoiseArea噪声区突破的ETF日内动量状态解读
  category: quant
  slash-rank: "432"
  default-deliverable: web
  required-packs: instrument_analytics artifacts
allowed-tools: search_instruments get_instrument_snapshot get_instrument_chart ask_user opptrix_run workspace_write workspace_read create_web update_web read_web list_web_vendor
---

# ETF 日内动量（NoiseArea）

方法溯源 QuantsPlaybook **另类 ETF 日内动量** 与 `SignalMaker/noise_area.py`：定义买卖力量平衡的噪声区域，突破则视为日内动量。

## 何时使用

用户要对 **场内 ETF** 做日内动量/噪声区突破状态解读。

边界：易混 `@skill:lean-etf-ibs-reversion`、`@skill:lean-gap-reversion`（勿合并）。默认网页交付。

## 分析架构

- **问题**：价格是否离开噪声区？方向？
- **证据**：分钟 OHLCV（完整路径）或日 K（降级）
- **数据自适应**：分钟 bars → `data_mode=full`；仅日 K → `data_mode=proxy` 并写 assumptions

## 数据维度

| 维度 | 取数方向 | 缺失时 |
|------|----------|--------|
| ETF | `search_instruments` | 先确认 |
| 分钟/日 K | `get_instrument_chart` → `workspace_write` | 日 K 可降级 |
| 计算 | `opptrix_run` | — |
| 交付 | `create_web` | — |

## 步骤

1. 尽量取分钟 K（`date` 含时刻）；否则日 K。
2. `python scripts/etf_intraday_momentum.py --input data.json --output result.json`
3. 检查 `meta.data_mode`：`proxy` 则在报告首页标明「日频代理」。
4. 解读上下界与突破 `signal`。
5. `create_web`。

## 依赖与降级

- 纯 Python。
- **日频降级**：用日振幅/开收距离代理噪声带宽；不可等同原策略日内成交假设。

## 禁止

- 荐股；把信号写成买卖指令
- 脚本内联网取数（jqdata / tushare / qlib / HTTP 行情）
- 假装完整回测引擎或伪造胜率
- 无交付就结束（默认 web）
- 与 `lean-*` 技能合并或冒充

