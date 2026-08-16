---
name: wavelet-timing
description: 小波分析择时（多尺度均线代理）。用户说「小波择时」「wavelet」「/wavelet-timing」时使用。多尺度 SMA 代理细节系数；meta.degraded。默认 create_web。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: 小波择时
  summary: 多尺度均线代理小波择时（降级）
  category: quant
  slash-rank: "525"
  default-deliverable: web
  required-packs: instrument_analytics artifacts
allowed-tools: search_instruments get_instrument_chart ask_user opptrix_run workspace_write workspace_read create_web update_web read_web list_web_vendor
references:
  - scripts/wavelet_timing.py
  - scripts/fixtures/sample_input.json
---

# 小波择时（降级）

有 `panels.wavelet_coeffs` → full；否则多尺度 SMA 投票 → proxy。无 sklearn SVM。

```bash
python scripts/wavelet_timing.py --input data.json --output result.json
```
