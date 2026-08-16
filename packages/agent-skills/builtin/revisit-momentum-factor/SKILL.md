---
name: revisit-momentum-factor
description: 再论动量因子。用户说「再论动量」「多周期动量」「动量衰减」「/revisit-momentum-factor」时使用。多窗口收益减波动惩罚并可跳过近端。默认 create_web。勿与 lean-returns-momentum 合并。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: 再论动量因子
  summary: 多窗口风险调整动量
  category: quant
  slash-rank: "570"
  default-deliverable: web
  required-packs: instrument_analytics artifacts
allowed-tools: search_instruments get_instrument_chart batch_instrument_snapshots get_index_constituents ask_user get_agent_skill_file opptrix_run workspace_write workspace_read create_web update_web read_web list_web_vendor
references:
  - scripts/revisit_momentum_factor.py
  - scripts/fixtures/sample_input.json
---

# 再论动量因子

多窗口 `R−λσ²` 等权合成；`params.skip` 可跳过近端（类似 12−1）。

边界：不与 `@skill:lean-returns-momentum` / `quality-momentum` 合并（本技能偏多窗口复现）。

## 运行

```bash
python scripts/revisit_momentum_factor.py --input data.json --output result.json
```

默认 `create_web`。仅标准库。

