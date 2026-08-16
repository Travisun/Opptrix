---
name: northbound-timing
description: 北向资金择时检验。用户说「北向择时」「北向资金能力」「/northbound-timing」时使用。必须有 panels.northbound；缺则 ok:false，禁止编造。默认 create_web。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: 北向资金择时
  summary: 北向净流入序列规则择时（缺数据则失败）
  category: quant
  slash-rank: "526"
  default-deliverable: web
  required-packs: market artifacts
allowed-tools: get_cn_market_special get_market_dynamics get_instrument_chart ask_user opptrix_run workspace_write workspace_read create_web update_web read_web list_web_vendor
references:
  - scripts/northbound_timing.py
  - scripts/fixtures/sample_input.json
---

# 北向资金择时

与 `@skill:northbound-flow`（字段探测摘要）分工：本技能做**序列择时规则**。无 `panels.northbound` → `ok:false`。

```bash
python scripts/northbound_timing.py --input data.json --output result.json
```

`panels.northbound[]`：`{date, net}`（或 `northbound_net`/`value`）。可选 `bars` 指数收盘对照。
