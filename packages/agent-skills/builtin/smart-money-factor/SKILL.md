---
name: smart-money-factor
description: 聪明钱因子 2.0（日频量价代理）。用户说「聪明钱」「Smart Money」「开源证券聪明钱」「/smart-money-factor」时使用。分钟不可得时用日 OHLCV 代理并 meta.degraded。默认 create_web。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: 聪明钱因子2.0
  summary: 日量价代理聪明钱因子
  category: quant
  slash-rank: "528"
  default-deliverable: web
  required-packs: instrument_analytics artifacts
allowed-tools: search_instruments get_instrument_chart batch_instrument_snapshots get_index_constituents ask_user get_agent_skill_file opptrix_run workspace_write workspace_read create_web update_web read_web list_web_vendor
references:
  - scripts/smart_money_factor.py
  - scripts/fixtures/sample_input.json
---

# 聪明钱因子 2.0（日频代理）

方法溯源开源证券「聪明钱因子模型 2.0」。完整版需分钟/逐笔；本技能用 **日频量价** 构造代理，并始终在 `meta.degraded` 标明。

## 算法要点

`S = sign(close−open) * (close−open)/(high−low+ε) * log(1+volume)` 窗口均值，截面排序。

## 运行

```bash
python scripts/smart_money_factor.py --input data.json --output result.json
```

默认 `create_web`。仅标准库。禁止 jqdata/tushare/qlib。

