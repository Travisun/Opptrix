---
name: de-portfolio-opt
description: 差分进化（DE）组合优化。用户说「DE组合优化」「差分进化权重」「/de-portfolio-opt」时使用。长仅权重最大化样本夏普；纯 Python。默认 create_web。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: DE组合优化
  summary: 差分进化约束下优化组合权重
  category: quant
  slash-rank: "522"
  default-deliverable: web
  required-packs: market instrument_analytics artifacts
allowed-tools: search_instruments get_instrument_chart batch_instrument_snapshots ask_user opptrix_run workspace_write workspace_read create_web update_web read_web list_web_vendor
references:
  - scripts/de_portfolio_opt.py
  - scripts/fixtures/sample_input.json
---

# DE 组合优化

映射名 **`de-portfolio-opt`**（非 optimize）。DE/rand/1/bin，长仅、`sum w=1`、单票上限。勿与 `@skill:lean-mean-variance` 合并。

```bash
python scripts/de_portfolio_opt.py --input data.json --output result.json
```
