---
name: disposition-cgo
description: 处置效应 CGO 因子。用户说「CGO」「处置效应」「资本利得突出」「参考价」「/disposition-cgo」时使用。用换手衰减加权参考价估计未实现资本利得。默认 create_web。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: 处置效应CGO
  summary: 资本利得突出量CGO
  category: quant
  slash-rank: "567"
  default-deliverable: web
  required-packs: instrument_analytics artifacts
allowed-tools: search_instruments get_instrument_chart batch_instrument_snapshots get_index_constituents ask_user get_agent_skill_file opptrix_run workspace_write workspace_read create_web update_web read_web list_web_vendor
references:
  - scripts/disposition_cgo.py
  - scripts/fixtures/sample_input.json
---

# 处置效应 CGO

`CGO = 收盘价 / 参考价 − 1`，参考价由窗口内换手衰减权重对成交均价加权。

## 运行

```bash
python scripts/disposition_cgo.py --input data.json --output result.json
```

缺换手时诚实降级。默认 `create_web`。仅标准库。

