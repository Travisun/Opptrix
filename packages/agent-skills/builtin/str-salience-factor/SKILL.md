---
name: str-salience-factor
description: 凸显理论 STR 因子（规则版）。用户说「STR」「凸显因子」「salience」「/str-salience-factor」时使用。截面收益偏离标准化带符号平均；去 qlib。默认 create_web。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: 凸显理论STR因子
  summary: 截面收益凸显度 STR 规则因子
  category: quant
  slash-rank: "517"
  default-deliverable: web
  required-packs: market instrument_analytics artifacts
allowed-tools: search_instruments get_instrument_chart batch_instrument_snapshots get_index_constituents ask_user opptrix_run workspace_write workspace_read create_web update_web read_web list_web_vendor
references:
  - scripts/str_salience_factor.py
  - scripts/fixtures/sample_input.json
---

# 凸显理论 STR 因子

规则版：交易日截面上 `|r−μ|/σ` 为凸显度，乘收益符号后窗口均值。禁止 qlib。

```bash
python scripts/str_salience_factor.py --input data.json --output result.json
```

输入多标的 `bars.close`；`params.window` 默认 20。
