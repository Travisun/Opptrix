---
name: quality-momentum
description: 高质量动量选股。用户说「高质量动量」「风险调整动量」「quality momentum」「/quality-momentum」时使用。用收益减波动惩罚并可选财务质量过滤。默认 create_web。勿与 lean-returns-momentum 合并。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: 高质量动量
  summary: 风险调整动量+质量过滤
  category: quant
  slash-rank: "569"
  default-deliverable: web
  required-packs: instrument_analytics fundamentals artifacts
allowed-tools: search_instruments get_instrument_financials get_index_constituents batch_instrument_snapshots ask_user get_agent_skill_file opptrix_run workspace_write workspace_read create_web update_web read_web list_web_vendor
references:
  - scripts/quality_momentum.py
  - scripts/fixtures/sample_input.json
---

# 高质量动量选股

`momentum = R_N − λ·σ²`；可选 `panels.financials`（ROE/负债等）过滤。

边界：不与 `@skill:lean-returns-momentum` 合并。

## 运行

```bash
python scripts/quality_momentum.py --input data.json --output result.json
```

默认 `create_web`。仅标准库。

