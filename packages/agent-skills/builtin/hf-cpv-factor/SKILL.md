---
name: hf-cpv-factor
description: 高频价量 CPV 因子。用户说「CPV」「价量相关」「高频价量」「/hf-cpv-factor」时使用。优先 panels.minute_bars；否则日频相关代理 + meta.degraded。默认 create_web。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: 高频价量CPV
  summary: 价量相关性CPV因子
  category: quant
  slash-rank: "529"
  default-deliverable: web
  required-packs: instrument_analytics artifacts
allowed-tools: search_instruments get_instrument_chart batch_instrument_snapshots get_index_constituents ask_user get_agent_skill_file opptrix_run workspace_write workspace_read create_web update_web read_web list_web_vendor
references:
  - scripts/hf_cpv_factor.py
  - scripts/fixtures/sample_input.json
---

# 高频价量 CPV 因子

方法溯源「高频价量相关性」选股因子。优先分钟序列；否则用日收益与量变化相关作代理并 `meta.degraded`。

## 运行

```bash
python scripts/hf_cpv_factor.py --input data.json --output result.json
```

- `panels.minute_bars`：`symbol,datetime,close,volume`
- 或 `bars` 日频降级

默认 `create_web`。仅标准库。

