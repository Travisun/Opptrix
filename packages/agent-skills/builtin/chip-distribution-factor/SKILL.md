---
name: chip-distribution-factor
description: 筹码分布因子（日 OHLCV 近似）。用户说「筹码分布」「筹码因子」「获利盘」「/chip-distribution-factor」时使用。换手衰减直方图推演；禁止 qlib。默认 create_web。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: 筹码分布因子
  summary: 日价量推演筹码分布近似因子
  category: quant
  slash-rank: "516"
  default-deliverable: web
  required-packs: market instrument_analytics artifacts
allowed-tools: search_instruments get_instrument_chart batch_instrument_snapshots get_index_constituents ask_user opptrix_run workspace_write workspace_read create_web update_web read_web list_web_vendor
references:
  - scripts/chip_distribution_factor.py
  - scripts/fixtures/sample_input.json
---

# 筹码分布因子

方法溯源 QuantsPlaybook「筹码因子」。用日频 OHLCV **换手衰减直方图**近似筹码；**禁止 qlib**。

## 运行

```bash
python scripts/chip_distribution_factor.py --input data.json --output result.json
```

输入：`bars` 含 open/high/low/close/volume。`params.lookback`（默认 60）、`bins`（默认 20）。

输出：`signal` 按因子降序；有 `panels.chip_distribution` → full，OHLCV 推演 → proxy。

## 依赖

仅标准库。
