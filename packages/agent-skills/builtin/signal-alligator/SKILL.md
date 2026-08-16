---
name: signal-alligator
description: 鳄鱼线/AO/分形信号模块。用户说「alligator信号」「AO信号」「/signal-alligator」时使用。输出 signal 序列；独立于 alligator-index-timing。默认 create_web。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: 鳄鱼线AO信号模块
  summary: SignalMaker鳄鱼线/AO信号序列
  category: quant
  slash-rank: "577"
  default-deliverable: web
  required-packs: instrument_analytics artifacts
allowed-tools: search_instruments get_instrument_snapshot get_instrument_chart ask_user get_agent_skill_file opptrix_run workspace_write workspace_read create_web update_web read_web list_web_vendor
references:
  - scripts/signal_alligator.py
  - scripts/fixtures/sample_input.json
---

# signal-alligator

SignalMaker 风格鳄鱼线 + AO 信号生成器。策略解读请用 `alligator-index-timing`；本技能专注**信号序列 JSON**。

`signal-utils-shared` 已并入本脚本，不单独交付。

## 运行

```bash
python scripts/signal_alligator.py --input data.json --output result.json
```

默认 `create_web`。仅标准库。
