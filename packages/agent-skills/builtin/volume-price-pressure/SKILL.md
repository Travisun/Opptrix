---
name: volume-price-pressure
description: 量价买卖压力因子（APB）。用户说「买卖压力」「APB」「量价压力」「东方量价」「/volume-price-pressure」时使用。日频 OHLCV 窗口内算术均价相对量权均价。默认 create_web。禁止脚本联网。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: 量价买卖压力
  summary: APB 量价压力因子截面排序
  category: quant
  slash-rank: "512"
  default-deliverable: web
  required-packs: market instrument_analytics artifacts
allowed-tools: search_instruments get_instrument_chart batch_instrument_snapshots get_index_constituents ask_user opptrix_run workspace_write workspace_read create_web update_web read_web list_web_vendor
references:
  - scripts/volume_price_pressure.py
  - scripts/fixtures/sample_input.json
---

# 量价买卖压力因子

方法溯源 **东方证券量价买卖压力（APB）**：窗口内算术均价 / 成交量加权均价。日频用典型价或成交额/量代理。

## 何时使用

用户要在日频价量上度量**相对量权成本的价格压力**并做截面比较。默认网页。

## 取数与运行

1. 确认宇宙与窗口（默认 30 日）。
2. 写入 OHLCV `bars`（建议含 volume、amount）。
3. 运行：

```bash
python scripts/volume_price_pressure.py --input data.json --output result.json
```

4. `create_web`。

### 参数

- `params.window`：默认 30  
- `params.log`：默认 true（对 APB 取对数）  
- `params.min_days`：窗口内最少有效成交日

### 输出

- `signal`：最新截面 ranking（高 APB → 价相对量权成本偏高）
- `series.apb`：历史序列（截断）

## 依赖

仅标准库。

## 禁止

- 无成交量时假装高精度；荐股；跳过 web
