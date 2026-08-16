---
name: team-coin-momentum
description: 球队硬币动量因子（规则版）。用户说「球队硬币」「动量一致性」「/team-coin-momentum」时使用。多窗口动量同向×强度；无 LightGBM。默认 create_web。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: 球队硬币动量
  summary: 多窗口动量一致性规则因子
  category: quant
  slash-rank: "518"
  default-deliverable: web
  required-packs: market instrument_analytics artifacts
allowed-tools: search_instruments get_instrument_chart batch_instrument_snapshots get_index_constituents ask_user opptrix_run workspace_write workspace_read create_web update_web read_web list_web_vendor
references:
  - scripts/team_coin_momentum.py
  - scripts/fixtures/sample_input.json
---

# 球队硬币动量（规则版）

多窗口动量符号一致性 × 强度；无 LightGBM。勿与 `@skill:lean-returns-momentum` 合并。

```bash
python scripts/team_coin_momentum.py --input data.json --output result.json
```
