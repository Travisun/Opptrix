---
name: firm-life-cycle
description: 企业生命周期分类与简单因子。用户说「企业生命周期」「Dickinson」「生命周期因子」「/firm-life-cycle」时使用。读 panels.financials 分类打分。默认 create_web。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: 企业生命周期因子
  summary: 现金流生命周期分类与示意因子
  category: quant
  slash-rank: "521"
  default-deliverable: web
  required-packs: fundamentals market artifacts
allowed-tools: get_instrument_financials search_instruments get_index_constituents ask_user opptrix_run workspace_write workspace_read create_web update_web read_web list_web_vendor
references:
  - scripts/firm_life_cycle.py
  - scripts/fixtures/sample_input.json
---

# 企业生命周期因子

Dickinson 风格经营/投资/筹资现金流符号分类；缺字段时用收入增速+ROE 代理。简单基本面分 + 阶段倾斜。

```bash
python scripts/firm_life_cycle.py --input data.json --output result.json
```

输入：`panels.financials[]` 含 `ocf/icf/fcf` 或 `revenue_growth`+`roe`。
