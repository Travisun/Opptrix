---
name: signal-hht
description: HHT/EMD 信号模块。用户说「HHT信号」「瞬时相位」「/signal-hht」时使用。无 PyEMD 时相位/包络代理并 meta.degraded。默认 create_web。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: HHT信号模块
  summary: 相位包络代理无PyEMD
  category: quant
  slash-rank: "578"
  default-deliverable: web
  required-packs: instrument_analytics artifacts
allowed-tools: search_instruments get_instrument_snapshot get_instrument_chart ask_user get_agent_skill_file opptrix_run workspace_write workspace_read create_web update_web read_web list_web_vendor
references:
  - scripts/signal_hht.py
  - scripts/fixtures/sample_input.json
---

# signal-hht

SignalMaker HHT 信号。有 `panels.emd`/`imf` → full；否则相位/包络代理 → proxy。策略技能见 `hht-timing`。

`signal-utils-shared` 已并入，不单独交付。

## 运行

```bash
python scripts/signal_hht.py --input data.json --output result.json
```

默认 `create_web`。仅标准库。
