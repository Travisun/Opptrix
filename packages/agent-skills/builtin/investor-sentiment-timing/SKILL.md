---
name: investor-sentiment-timing
description: 投资者情绪指数择时。用户说「投资者情绪」「情绪指数」「情绪择时」「/investor-sentiment-timing」时使用。用涨跌广度与换手等代理合成情绪指数。默认 create_web。勿与文本 NLP 情绪技能合并。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: 投资者情绪择时
  summary: 广度换手情绪代理合成
  category: quant
  slash-rank: "564"
  default-deliverable: web
  required-packs: instrument_analytics artifacts
allowed-tools: search_instruments get_instrument_chart batch_instrument_snapshots get_index_constituents ask_user get_agent_skill_file opptrix_run workspace_write workspace_read create_web update_web read_web list_web_vendor
references:
  - scripts/investor_sentiment_timing.py
  - scripts/fixtures/sample_input.json
---

# 投资者情绪指数择时

用可得代理（涨跌家数比、换手、可选涨跌停占比）标准化后等权合成情绪指数。

边界：不与 `@skill:lean-sentiment-nlp`（文本情绪）合并。

## 运行

```bash
python scripts/investor_sentiment_timing.py --input data.json --output result.json
```

可选 `panels.sentiment`。默认 `create_web`。仅标准库。

