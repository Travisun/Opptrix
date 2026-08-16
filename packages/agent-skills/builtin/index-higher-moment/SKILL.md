---
name: index-higher-moment
description: 指数高阶矩择时。用户说「高阶矩」「五阶矩择时」「矩择时」「/index-higher-moment」时使用。用收益高阶矩EMA切线法。默认 create_web。禁止荐股。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: 指数高阶矩择时
  summary: 五阶矩EMA切线法择时状态
  category: quant
  slash-rank: "573"
  default-deliverable: web
  required-packs: instrument_analytics artifacts
allowed-tools: search_instruments get_instrument_snapshot get_instrument_chart ask_user get_agent_skill_file opptrix_run workspace_write workspace_read create_web update_web read_web list_web_vendor
references:
  - scripts/index_higher_moment.py
  - scripts/fixtures/sample_input.json
---

# 指数高阶矩择时

用日收益高阶原点矩（默认 5 阶）刻画尾部风险发散，经 EMA 平滑后用切线法给规则状态。

## 运行

```bash
python scripts/index_higher_moment.py --input data.json --output result.json
```

`params.select_alpha=true` 时尝试滚动网格选 α；样本不足则降级固定 α 并 `meta.degraded`。默认 `create_web`。仅标准库。
