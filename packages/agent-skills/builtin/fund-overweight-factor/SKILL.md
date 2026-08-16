---
name: fund-overweight-factor
description: 基金重仓超配因子。用户说「基金超配」「重仓超配」「指数增强持仓」「/fund-overweight-factor」时使用。需 panels.fund_holdings 与 benchmark_weights；缺则 ok:false。默认 create_web。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: 基金重仓超配
  summary: 相对基准超配因子
  category: quant
  slash-rank: "534"
  default-deliverable: web
  required-packs: instrument_analytics artifacts
allowed-tools: search_instruments get_instrument_chart batch_instrument_snapshots get_index_constituents ask_user get_agent_skill_file opptrix_run workspace_write workspace_read create_web update_web read_web list_web_vendor
references:
  - scripts/fund_overweight_factor.py
  - scripts/fixtures/sample_input.json
---

# 基金重仓超配因子

对基金持仓相对基准权重做超配：`overweight = fund_w − bench_w`，截面聚合后排序。

## 必需输入

- `panels.fund_holdings[]`：`fund_id, symbol, weight`
- `panels.benchmark_weights[]`：`symbol, weight`

缺任一 → `ok:false`。

## 运行

```bash
python scripts/fund_overweight_factor.py --input data.json --output result.json
```

默认 `create_web`。

