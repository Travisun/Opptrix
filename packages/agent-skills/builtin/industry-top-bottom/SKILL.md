---
name: industry-top-bottom
description: 行业指数顶部与底部信号。用户说「行业顶底」「NHNL」「净新高」「行业情绪」「/industry-top-bottom」时使用。用成分或行业集合的净新高占比刻画顶底风险。默认 create_web。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: 行业顶底信号
  summary: NH-NL净新高占比
  category: quant
  slash-rank: "565"
  default-deliverable: web
  required-packs: instrument_analytics artifacts
allowed-tools: search_instruments get_instrument_chart batch_instrument_snapshots get_index_constituents ask_user get_agent_skill_file opptrix_run workspace_write workspace_read create_web update_web read_web list_web_vendor
references:
  - scripts/industry_top_bottom.py
  - scripts/fixtures/sample_input.json
---

# 行业指数顶底信号

方法溯源行业 NH−NL（净新高占比）。`bars` 可为行业指数集合或单行业成分。

## 运行

```bash
python scripts/industry_top_bottom.py --input data.json --output result.json
```

`signal`：2 贪婪 / 1 乐观 / 0 中性 / -1 悲观 / -2 恐惧。默认 `create_web`。

