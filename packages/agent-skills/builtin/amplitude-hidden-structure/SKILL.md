---
name: amplitude-hidden-structure
description: 振幅因子隐藏结构。用户说「振幅因子」「高低价区振幅」「AF 因子」「/amplitude-hidden-structure」时使用。拆分高/低价区振幅以提取选股信息。默认 create_web。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: 振幅隐藏结构
  summary: 高低价区振幅因子
  category: quant
  slash-rank: "568"
  default-deliverable: web
  required-packs: instrument_analytics artifacts
allowed-tools: search_instruments get_instrument_chart batch_instrument_snapshots get_index_constituents ask_user get_agent_skill_file opptrix_run workspace_write workspace_read create_web update_web read_web list_web_vendor
references:
  - scripts/amplitude_hidden_structure.py
  - scripts/fixtures/sample_input.json
---

# 振幅因子隐藏结构

`AF = high/low − 1`，按窗口内收盘分位切分高/低价区后分别聚合。

## 运行

```bash
python scripts/amplitude_hidden_structure.py --input data.json --output result.json
```

`params.group`：`low`（默认）| `high`。默认 `create_web`。

