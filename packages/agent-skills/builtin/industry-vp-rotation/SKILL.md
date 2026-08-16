---
name: industry-vp-rotation
description: 行业有效量价因子与轮动。用户说「行业轮动」「量价轮动」「行业ETF轮动」「/industry-vp-rotation」时使用。对行业/ETF 日K构造量价强度并排序。禁止 qlib。默认 create_web。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: 行业量价轮动
  summary: 行业/ETF量价轮动
  category: quant
  slash-rank: "532"
  default-deliverable: web
  required-packs: instrument_analytics artifacts
allowed-tools: search_instruments get_instrument_chart batch_instrument_snapshots get_index_constituents ask_user get_agent_skill_file opptrix_run workspace_write workspace_read create_web update_web read_web list_web_vendor
references:
  - scripts/industry_vp_rotation.py
  - scripts/fixtures/sample_input.json
---

# 行业量价因子与轮动

方法溯源「行业有效量价因子与行业轮动」。对行业指数/ETF 日频量价算强度，输出轮动排序。**禁止 qlib**。

## 算法

窗口内：收益动量 × 相对成交量（量 / 均量）。截面降序作轮动候选。

## 运行

```bash
python scripts/industry_vp_rotation.py --input data.json --output result.json
```

易混 `lean-etf-global-rotation` / `lean-sector-weighting`（勿合并）。默认 `create_web`。

