---
name: vol-factor-timing
description: 择时视角波动率因子。用户说「波动率因子择时」「低波择时」「/vol-factor-timing」时使用。用已实现波动双均线；无截面则 degraded。默认 create_web。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: 择时视角波动率因子
  summary: 已实现波动双均线择时
  category: quant
  slash-rank: "576"
  default-deliverable: web
  required-packs: instrument_analytics artifacts
allowed-tools: search_instruments get_instrument_snapshot get_instrument_chart ask_user get_agent_skill_file opptrix_run workspace_write workspace_read create_web update_web read_web list_web_vendor
references:
  - scripts/vol_factor_timing.py
  - scripts/fixtures/sample_input.json
---

# 择时视角波动率因子

从择时视角使用波动率因子：默认 21 日已实现波动 + 快慢均线。可选 `panels.vol_breadth` 做数量剪刀差。

## 运行

```bash
python scripts/vol_factor_timing.py --input data.json --output result.json
```

默认 `create_web`。仅标准库。
