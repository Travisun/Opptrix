---
name: vmacd-mtm-timing
description: VMACD_MTM 价量共振择时。用户说「VMACD」「价量共振」「成交量MACD」「VMACD_MTM」「/vmacd-mtm-timing」时使用。方法溯源东北证券 VMACD_MTM 与 QuantsPlaybook SignalMaker；数据经 workspace JSON。默认 create_web。禁止脚本内取数。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: VMACD价量共振
  summary: 成交量MACD动量与价格动量共振状态解读
  category: quant
  slash-rank: "431"
  default-deliverable: web
  required-packs: instrument_analytics artifacts
allowed-tools: search_instruments get_instrument_snapshot get_instrument_chart ask_user opptrix_run workspace_write workspace_read create_web update_web read_web list_web_vendor
---

# VMACD_MTM 价量共振择时

方法溯源 **东北证券 VMACD_MTM**（QuantsPlaybook `SignalMaker/vmacd_mtm.py`）；对本技能写入的成交量序列计算动量并与价格动量做共振解读。

## 何时使用

用户要看 **成交量 MACD 动量**是否与价格趋势同向（价量共振）。

边界：通用指标手册用 `@skill:lean-indicator-playbook`；勿与之合并。默认网页交付。

## 分析架构（投研方法）

- **问题/假设**：VMACD_MTM 方向如何？是否与 period 收益同向？
- **证据**：volume/close 日 K；参数 period（默认 60）
- **交叉验证**：量能动量 vs 价格动量；背离记 0
- **事实 | 假设 | 推断** 分栏

## 数据维度

| 维度 | 取数方向 | 缺失时 |
|------|----------|--------|
| 标的 | `search_instruments` | 先确认 |
| 日 K（含 volume） | `get_instrument_chart` → `workspace_write` | 无量则失败 |
| 计算 | `opptrix_run` | 说明错误 |
| 交付 | `create_web` | — |

## 步骤

1. 确认标的与 `params.period`（默认 60）。
2. 写入至少约 `period+40` 根日 K。
3. `python scripts/vmacd_mtm_timing.py --input data.json --output result.json`
4. 解读 `series.vmacd_mtm` 与共振 `signal`。
5. `create_web` 交付。

## 依赖与降级

- 纯 Python EMA/MACD；无 talib。
- 样本不足返回 `ok=false`。

## 禁止

- 荐股；把信号写成买卖指令
- 脚本内联网取数（jqdata / tushare / qlib / HTTP 行情）
- 假装完整回测引擎或伪造胜率
- 无交付就结束（默认 web）
- 与 `lean-*` 技能合并或冒充

