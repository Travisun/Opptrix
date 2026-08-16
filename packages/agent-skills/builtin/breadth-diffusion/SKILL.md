---
name: breadth-diffusion
description: 扩散指标择时。用户说「扩散指标」「市场广度」「涨跌家数」「站上均线家数」「/breadth-diffusion」时使用。用多标的日 K 统计上涨/站上均线广度，双均线给出状态。默认 create_web。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: 扩散指标择时
  summary: 多标的广度扩散与双均线状态
  category: quant
  slash-rank: "514"
  default-deliverable: web
  required-packs: market instrument_analytics artifacts
allowed-tools: get_index_constituents get_sector_constituents get_instrument_chart batch_instrument_snapshots search_instruments ask_user opptrix_run workspace_write workspace_read create_web update_web read_web list_web_vendor
references:
  - scripts/breadth_diffusion.py
  - scripts/fixtures/sample_input.json
---

# 扩散指标择时

方法溯源 **东北证券扩散指标**：用成分/宇宙多标的统计**市场广度**，再对广度序列做双均线状态。

## 何时使用

用户要看「有多少股票在涨 / 站上均线」及其趋势状态。默认网页。

## 取数与运行

1. 取指数/板块成分 → 批量日 K 写入同一 `bars`（多 `symbol`）。
2. 运行：

```bash
python scripts/breadth_diffusion.py --input data.json --output result.json
```

3. `create_web`。

### 参数

- `params.mode`：`advance`（默认，上涨家数占比）| `above_ma`  
- `params.ma_n`：站上均线窗口（默认 60）  
- `params.fast` / `params.slow`：广度快/慢平滑（默认 20 / 10）

### 输出

- `signal`：状态序列（1 偏多 / 0 偏空或观望）  
- `series.breadth` / `advance_ratio` / `above_ma_ratio`

样本非全市场时须在报告写明宇宙范围。

## 依赖

仅标准库。

## 禁止

- 单标的假装市场广度；荐股；跳过 web
