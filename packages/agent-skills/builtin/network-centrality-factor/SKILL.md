---
name: network-centrality-factor
description: 股票网络度中心性因子。用户说「网络中心度」「相关网络」「/network-centrality-factor」时使用。收益相关矩阵构图取度中心性；纯 Python。默认 create_web。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: 网络中心度因子
  summary: 收益相关网络度中心性选股因子
  category: quant
  slash-rank: "519"
  default-deliverable: web
  required-packs: market instrument_analytics artifacts
allowed-tools: search_instruments get_instrument_chart batch_instrument_snapshots get_index_constituents ask_user opptrix_run workspace_write workspace_read create_web update_web read_web list_web_vendor
references:
  - scripts/network_centrality_factor.py
  - scripts/fixtures/sample_input.json
---

# 网络中心度因子

多标的日收益相关网络，`|corr|≥阈值` 为边，输出度中心性。纯 Python。

```bash
python scripts/network_centrality_factor.py --input data.json --output result.json
```
