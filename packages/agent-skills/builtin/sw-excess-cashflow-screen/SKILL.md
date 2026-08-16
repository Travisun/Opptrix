---
name: sw-excess-cashflow-screen
description: 申万罗伯·瑞克超额现金流选股。用户说「超额现金流」「罗伯瑞克」「自由现金流选股」「申万大师」「/sw-excess-cashflow-screen」时使用。按 PB/股息/PE/负债/价格现金流比规则筛选。默认 create_web。勿与 lean-magic-formula 合并。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: 超额现金流选股
  summary: 罗伯·瑞克现金流规则筛选
  category: quant
  slash-rank: "571"
  default-deliverable: web
  required-packs: fundamentals market artifacts
allowed-tools: search_instruments get_instrument_financials get_index_constituents batch_instrument_snapshots ask_user get_agent_skill_file opptrix_run workspace_write workspace_read create_web update_web read_web list_web_vendor
references:
  - scripts/sw_excess_cashflow.py
  - scripts/fixtures/sample_input.json
---

# 罗伯·瑞克超额现金流选股

近似条件：`PB<3`、股息高于截面均值、PE 低于截面均值、借款/总资产`<0.33`、价格/FCFF 低于截面均值的 0.8 倍。

边界：不与 `@skill:lean-magic-formula` 合并。

## 运行

```bash
python scripts/sw_excess_cashflow.py --input data.json --output result.json
```

须提供 `panels.financials`；可选 `bars` 补 close。默认 `create_web`。仅标准库。

