---
name: price-efficiency-trend
description: 点位效率趋势预测。用户说「点位效率」「上下行划分」「兴业点位效率」「/price-efficiency-trend」时使用。用 MACD 划分趋势段并估计相对价格效率。默认 create_web。禁止联网取数。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: 点位效率趋势
  summary: MACD上下行与相对价格效率
  category: quant
  slash-rank: "561"
  default-deliverable: web
  required-packs: instrument_analytics artifacts
allowed-tools: search_instruments get_instrument_chart ask_user get_agent_skill_file opptrix_run workspace_write workspace_read create_web update_web read_web list_web_vendor
references:
  - scripts/price_efficiency_trend.py
  - scripts/fixtures/sample_input.json
---

# 点位效率趋势

方法溯源兴业「点位效率」：以 MACD（DIF−DEA）划分上下行，并计算段内相对价格效率。

## 取数与运行

```bash
python scripts/price_efficiency_trend.py --input data.json --output result.json
```

`params.method`：`A`（默认）| `B`（减 ATR×rate）| `C`（降级为 A）。默认 `create_web`。仅标准库。

