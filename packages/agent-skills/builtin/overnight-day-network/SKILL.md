---
name: overnight-day-network
description: 隔夜-日间网络因子（简化 lead-lag）。用户说「隔夜日间网络」「overnight day network」「/overnight-day-network」时使用。open/close 拆收益；禁 qlib。默认 create_web。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: 隔夜日间网络因子
  summary: 隔夜对日间 lead-lag 简化网络因子
  category: quant
  slash-rank: "520"
  default-deliverable: web
  required-packs: market instrument_analytics artifacts
allowed-tools: search_instruments get_instrument_chart batch_instrument_snapshots get_index_constituents ask_user opptrix_run workspace_write workspace_read create_web update_web read_web list_web_vendor
references:
  - scripts/overnight_day_network.py
  - scripts/fixtures/sample_input.json
---

# 隔夜-日间网络因子

简化 lead-lag：自相关隔夜→日间 + 对其他标的日间相关均值。禁 qlib/聚类完整版。

```bash
python scripts/overnight_day_network.py --input data.json --output result.json
```
