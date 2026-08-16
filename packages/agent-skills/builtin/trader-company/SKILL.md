---
name: trader-company
description: Trader-Company 集成策略（降级）。用户说「Trader-Company」「交易员公司集成」「/trader-company」时使用。多规则投票近似完整进化集成。默认 create_web。禁止荐股。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: Trader-Company集成
  summary: 多信号规则集成诚实降级
  category: quant
  slash-rank: "574"
  default-deliverable: web
  required-packs: instrument_analytics artifacts
allowed-tools: search_instruments get_instrument_snapshot get_instrument_chart ask_user get_agent_skill_file opptrix_run workspace_write workspace_read create_web update_web read_web list_web_vendor
references:
  - scripts/trader_company.py
  - scripts/fixtures/sample_input.json
---

# Trader-Company 集成（诚实降级）

有 `panels.tc_signals`/`traders` → full；否则用 **4 条可解释规则 + 投票** 作 proxy（`data_mode=proxy`）。

## 运行

```bash
python scripts/trader_company.py --input data.json --output result.json
```

默认 `create_web`。仅标准库。勿与完整论文回测结果等同。
