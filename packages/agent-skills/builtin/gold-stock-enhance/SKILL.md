---
name: gold-stock-enhance
description: 金股增强策略。用户说「金股」「券商金股」「金股增强」「/gold-stock-enhance」时使用。panels.gold_list + 日K动量/波动过滤。默认 create_web。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: 金股增强
  summary: 券商金股列表增强
  category: quant
  slash-rank: "535"
  default-deliverable: web
  required-packs: instrument_analytics artifacts
allowed-tools: search_instruments get_instrument_chart batch_instrument_snapshots get_index_constituents ask_user get_agent_skill_file opptrix_run workspace_write workspace_read create_web update_web read_web list_web_vendor
references:
  - scripts/gold_stock_enhance.py
  - scripts/fixtures/sample_input.json
---

# 金股增强策略

跟踪券商金股名单，结合日 K 动量与波动做简单增强排序。

## 输入

- `panels.gold_list[]`：`symbol`（可选 `broker, month`）
- `bars`：金股日 K

## 运行

```bash
python scripts/gold_stock_enhance.py --input data.json --output result.json
```

缺名单 → `ok:false`。默认 `create_web`。

