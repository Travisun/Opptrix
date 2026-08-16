---
name: cck-herding
description: CCK 羊群效应度量。用户说「羊群效应」「CCK」「CSAD」「截面离散度」「/cck-herding」时使用。用多标的收益截面 CSAD 与市场收益平方项回归识别羊群状态。默认 create_web。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: CCK羊群效应
  summary: CSAD与Rm²羊群度量
  category: quant
  slash-rank: "563"
  default-deliverable: web
  required-packs: instrument_analytics artifacts
allowed-tools: search_instruments get_instrument_chart batch_instrument_snapshots get_index_constituents ask_user get_agent_skill_file opptrix_run workspace_write workspace_read create_web update_web read_web list_web_vendor
references:
  - scripts/cck_herding.py
  - scripts/fixtures/sample_input.json
---

# CCK 羊群效应

方法溯源 CCK 模型：截面绝对偏离 CSAD，对 `|Rm|` 与 `Rm²` 回归；`Rm²` 系数为负且市场上行时标记羊群。

## 运行

```bash
python scripts/cck_herding.py --input data.json --output result.json
```

输入须为**多标的** `bars`。默认 `create_web`。仅标准库。

