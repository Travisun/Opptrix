---
name: factor-timing
description: 因子择时。用户说「因子择时」「因子开关」「Alpha 择时」「/factor-timing」时使用。对 panels.factor_returns 施加滚动动量/阈值开关。默认 create_web。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: 因子择时
  summary: 因子收益序列择时开关
  category: quant
  slash-rank: "531"
  default-deliverable: web
  required-packs: instrument_analytics artifacts
allowed-tools: search_instruments get_instrument_chart batch_instrument_snapshots get_index_constituents ask_user get_agent_skill_file opptrix_run workspace_write workspace_read create_web update_web read_web list_web_vendor
references:
  - scripts/factor_timing.py
  - scripts/fixtures/sample_input.json
---

# 因子择时

方法溯源光大等「因子择时」路演思路：对已有 **因子收益序列** 做开关，而非重算因子。

## 输入

`panels.factor_returns[]`：`date, factor, ret`

规则：滚动 `window` 日因子收益均值 > `threshold` → 开仓信号 1，否则 0。

## 运行

```bash
python scripts/factor_timing.py --input data.json --output result.json
```

默认 `create_web`。易混 `lean-param-grid-optimize`（勿合并）。

